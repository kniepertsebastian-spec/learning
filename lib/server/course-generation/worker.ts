import { isRetryableError, type AIUsage } from "@/lib/ai/generate";
import { estimateCostUsd } from "@/lib/server/admin/content-generation";
import {
  createSplitPartJobs,
  getCourseGenerationJob,
  markCourseGenerationJobFailed,
  touchCourseGenerationJob,
  updateCourseGenerationJob,
  updateCourseGenerationObjective,
  upsertCourseGenerationObjective,
  type CourseGenerationJob,
  type CourseGenerationObjectiveRow,
} from "./job-service";
import { tagConceptsAfterGeneration } from "@/lib/server/psrp/concepts";
import { importCoursePackage, suggestCourseSlug } from "./importer";
import { AiAccessUnavailableError, clientForOrganization } from "@/lib/server/internal-courses/ai-client";
import { LESSONS_MODEL } from "@/lib/claude";
import { createImageDescriber, type ImageDescriber } from "@/lib/server/internal-courses/vision";
import { DocumentSourceError, loadJobSources } from "@/lib/server/internal-courses/document-sources";
import {
  createHaikuContentProvider,
  createSonnetBlueprintProvider,
  createSonnetRepairProvider,
  anthropicHaikuContentProvider,
  anthropicSonnetRepairProvider,
  resolveBlueprintProvider,
  type BlueprintProvider,
  type CourseContentProvider,
} from "./providers";
import {
  courseBlueprintV1Schema,
  coursePackageV1Schema,
  objectiveContentNoQuestionsResponseSchema,
  objectiveContentResponseSchema,
  COURSE_PACKAGE_SCHEMA_VERSION,
  type CourseBlueprintDomain,
  type CourseBlueprintObjective,
  type CourseBlueprintV1,
  type CoursePackageDomain,
  type CoursePackageV1,
  type ObjectiveContentResponse,
} from "./schemas";
import { looksLikeOutline } from "./outline";
import { partTitle, splitBlueprint } from "./split";
import { fetchSources, type FetchedSource } from "./sources";
import { buildSourceReport } from "./coverage";
import { autoFixObjectiveContent, missingQuestionsOnly, pickCanaryIndex, validateBlueprint, validateObjectiveContent } from "./validation";
import { getDb } from "@/lib/server/db/client";
import { certificationCategories, certifications, courseGenerationJobDocuments } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";

export class PreflightError extends Error {}
export class BlueprintValidationError extends Error {}
export class CanaryFailedError extends Error {}
export class CircuitBreakerOpenError extends Error {}
export class BudgetExceededError extends Error {}
export class JobCancelledError extends Error {}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
function envFloat(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Abschnitt 12/18: Konfigurierbare Grenzwerte, exakt dieselben Env-Var-Namen
 * wie in course_generation.md Abschnitt 18 (Präfix `COURSE_GEN_`, da die
 * Original-Namen wie `MAX_REPAIR_ATTEMPTS` zu generisch für globale Env-Vars
 * wären). */
const MAX_REPAIR_ATTEMPTS = envInt("COURSE_GEN_MAX_REPAIR_ATTEMPTS", 2);
const MAX_CANARY_ATTEMPTS = envInt("COURSE_GEN_MAX_CANARY_ATTEMPTS", 2);
const INITIAL_BATCH_SIZE = envInt("COURSE_GEN_INITIAL_BATCH_SIZE", 3);
const GENERATION_BATCH_SIZE = envInt("COURSE_GEN_BATCH_SIZE", 5);
const MAX_BATCH_ERROR_RATE = envFloat("COURSE_GEN_MAX_BATCH_ERROR_RATE", 0.3);
const MAX_IDENTICAL_ERRORS = envInt("COURSE_GEN_MAX_IDENTICAL_ERRORS", 2);
const HARD_MAX_OBJECTIVES = envInt("COURSE_GEN_HARD_MAX_OBJECTIVES", 80);

/** Höchstmenge Quelltext, die an die KI für EIN Lernziel geht (bei Kursen mit vielen Dateien sonst Hunderttausende Zeichen je Aufruf).
 * War 80.000 Zeichen (≈ 20k Token je Aufruf). Seit Text- und HTML-Quellen in Abschnitte zerlegt werden (sources.ts),
 * trifft die Auswahl per Locator gezielt; 30.000 Zeichen reichen dann für ein Lernziel. Per Env überschreibbar. */
export const MAX_EXCERPT_CHARS_PER_OBJECTIVE = envInt("COURSE_GEN_MAX_EXCERPT_CHARS", 30_000);

/**
 * Welche Textstellen die KI für ein Lernziel bekommt: die vom Blueprint genannten; fehlt die Angabe oder passt keine
 * (die KI schreibt Verweise manchmal leicht anders), alle, jeweils auf die Höchstmenge gekürzt.
 */
export function selectSourceExcerpts(sources: FetchedSource[], locators: string[], maxChars = MAX_EXCERPT_CHARS_PER_OBJECTIVE) {
  const all = sources.flatMap((s) => s.excerpts);
  const picked = locators.length === 0 ? all : all.filter((e) => locators.includes(e.locator));
  const chosen = picked.length > 0 ? picked : all;
  const out: typeof all = [];
  let used = 0;
  for (const e of chosen) {
    if (used >= maxChars) break;
    const room = maxChars - used;
    out.push(e.text.length > room ? { ...e, text: e.text.slice(0, room) } : e);
    used += Math.min(e.text.length, room);
  }
  return out;
}

/** Häufigster Fehlergrund der fehlgeschlagenen Lernziele, damit die Meldung nicht nur eine Quote nennt. */
function topErrorHint(errorCounts: Map<string, number>): string {
  const top = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? ` Häufigster Grund (${top[1]}×): ${top[0].slice(0, 300)}` : "";
}

async function hasJobDocuments(jobId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: courseGenerationJobDocuments.id }).from(courseGenerationJobDocuments).where(eq(courseGenerationJobDocuments.jobId, jobId)).limit(1);
  return Boolean(row);
}

export interface CourseGenerationDeps {
  blueprintProvider: BlueprintProvider;
  contentProvider: CourseContentProvider;
  repairProvider: CourseContentProvider;
  fetchSourcesFn: (urls: string[]) => Promise<FetchedSource[]>;
  /** Interne Lernpfade: Text des Firmendokuments (geschwärzt und gescannt). */
  loadDocumentSourcesFn: (organizationId: string, jobId: string, describeImage?: ImageDescriber, legacyDocumentId?: string | null) => Promise<FetchedSource[]>;
  /** Interne Lernpfade: beschreibt Screenshots über den KI-Zugang der Firma. */
  describeImageFn?: ImageDescriber;
}

/**
 * Standard-Bausteine. Bei internen Lernpfaden einer Firma (organizationId) laufen alle KI-Aufrufe über den Zugang
 * der Firma (eigener Schlüssel oder unser Zugang, siehe resolveAiAccess); ohne nutzbaren Zugang bricht der Lauf
 * im Preflight ab, bevor etwas an die KI geht.
 */
async function defaultDeps(
  job: CourseGenerationJob,
  override?: Partial<CourseGenerationDeps>,
): Promise<CourseGenerationDeps> {
  const base = { fetchSourcesFn: fetchSources, loadDocumentSourcesFn: loadJobSources };
  if (!job.organizationId) {
    return {
      blueprintProvider: resolveBlueprintProvider(job.blueprintProvider),
      contentProvider: anthropicHaikuContentProvider,
      repairProvider: anthropicSonnetRepairProvider,
      ...base,
    };
  }
  if (override?.blueprintProvider && override.contentProvider && override.repairProvider) {
    return { blueprintProvider: override.blueprintProvider, contentProvider: override.contentProvider, repairProvider: override.repairProvider, ...base, describeImageFn: override.describeImageFn };
  }
  try {
    const client = await clientForOrganization(job.organizationId);
    return {
      blueprintProvider: createSonnetBlueprintProvider(client),
      contentProvider: createHaikuContentProvider(client),
      repairProvider: createSonnetRepairProvider(client),
      ...base,
      describeImageFn: createImageDescriber(LESSONS_MODEL, client),
    };
  } catch (error) {
    if (error instanceof AiAccessUnavailableError) throw new PreflightError(error.message);
    throw error;
  }
}

/**
 * Wie die Inhalte dieses Auftrags erzeugt werden: Fragen nur, wenn Lektionstests oder Abschlussprüfung gewünscht sind
 * (die Prüfung zieht ihre Fragen aus demselben Pool); anwendungsnahe Fragen (Logs, Befehle) bei internen Lernpfaden.
 */
function generationModeOf(job: CourseGenerationJob, outline: boolean) {
  return {
    withQuestions: job.includeSectionQuizzes || job.includeFinalExam,
    practical: Boolean(job.organizationId),
    outline,
  };
}

/** Slug des Lernpfads. Interne Lernpfade tragen die Auftrags-ID, damit Titel verschiedener Firmen nie kollidieren. */
function plannedSlugFor(job: CourseGenerationJob): string {
  const base = suggestCourseSlug(job.courseTitle, job.certificationVersion ?? undefined);
  return job.organizationId ? `${base.slice(0, 60)}-${job.id.slice(0, 8)}` : base;
}

interface ObjectiveEntry {
  domain: CourseBlueprintDomain;
  objective: CourseBlueprintObjective;
}

interface ObjectiveRunResult {
  success: boolean;
  content: ObjectiveContentResponse | null;
  errors: string[];
  costUsd: number;
}

/** Abschnitt 3.6/11: generiert EIN Objective, validiert es, repariert bei
 * Fehlern zunächst mit demselben (günstigen) Provider bis `maxAttempts`
 * insgesamt, danach genau EINMAL mit `deps.repairProvider` (Sonnet) - erst
 * wenn auch das fehlschlägt, gilt das Objective als endgültig gescheitert. */
async function generateAndValidateObjective(
  jobId: string,
  objectiveRow: CourseGenerationObjectiveRow,
  deps: CourseGenerationDeps,
  job: CourseGenerationJob,
  entry: ObjectiveEntry,
  sources: FetchedSource[],
  maxAttempts: number,
  outline: boolean,
): Promise<ObjectiveRunResult> {
  const objectiveRowId = objectiveRow.id;

  // Resume nach Unterbrechung/Retry (Phase 2-Abnahme): ein bereits als
  // "valid" gespeichertes Objective wird NICHT erneut generiert - spart
  // Tokens/Kosten und macht "Retry" auf einem teilweise erfolgreichen Job
  // sinnvoll statt alles neu zu erzeugen.
  if (objectiveRow.status === "valid" && objectiveRow.contentJson) {
    const cached = (job.includeSectionQuizzes || job.includeFinalExam ? objectiveContentResponseSchema : objectiveContentNoQuestionsResponseSchema).safeParse(objectiveRow.contentJson);
    if (cached.success) {
      return { success: true, content: cached.data, errors: [], costUsd: 0 };
    }
  }

  const sourceExcerpts = selectSourceExcerpts(sources, entry.objective.sourceLocators);
  const input = {
    courseTitle: job.courseTitle,
    language: job.language as "de" | "en",
    domain: entry.domain,
    objective: entry.objective,
    sourceExcerpts,
    ...generationModeOf(job, outline),
  };

  await updateCourseGenerationObjective(objectiveRowId, { status: "generating" });

  let attemptCostUsd = 0;
  const trackUsage = (usage: AIUsage) => {
    const cost = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model, usage.cachedTokens);
    if (cost !== null) attemptCostUsd += cost;
    // Lebenszeichen nach jeder KI-Antwort (siehe recoverStaleCourseGenerationJobs); ein Fehler hier stört den Lauf nicht.
    void touchCourseGenerationJob(jobId).catch(() => undefined);
  };

  let result: ObjectiveContentResponse;
  try {
    result = await deps.contentProvider.generateObjective(input, trackUsage);
  } catch (error) {
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "failed",
      attempts: 1,
      provider: deps.contentProvider.name,
      model: deps.contentProvider.model,
      validationErrorsJson: [(error as Error).message],
    });
    return { success: false, content: null, errors: [(error as Error).message], costUsd: attemptCostUsd };
  }

  // Was sich ohne KI beheben lässt (doppelte Fragen, unbekannte Quellenverweise), wird ohne KI behoben.
  const autoFix = (content: ObjectiveContentResponse) => autoFixObjectiveContent(content, sourceExcerpts).content;
  result = autoFix(result);
  let errors = validateAttempt(entry.objective, result, sourceExcerpts, input);
  let usedProvider = deps.contentProvider;
  let attempts = 1;

  /**
   * Teil-Reparatur: fehlen nur Fragen (Anzahl oder Szenario-Frage), liefert der Provider genau diese nach. Lektionen
   * und alte Antwort gehen dabei nicht erneut an die KI und werden nicht neu geschrieben.
   */
  const topUpQuestions = async (provider: CourseContentProvider): Promise<boolean> => {
    const need = missingQuestionsOnly(entry.objective, result, errors);
    if (!need || !provider.generateQuestions) return false;
    const extra = await provider.generateQuestions(
      input,
      { ...need, existingQuestions: result.questions.map((q) => q.question[input.language]) },
      trackUsage,
    );
    result = autoFix({ ...result, questions: [...result.questions, ...extra] });
    errors = validateAttempt(entry.objective, result, sourceExcerpts, input);
    return true;
  };

  while (errors.length > 0 && attempts < maxAttempts) {
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "repairing",
      attempts,
      validationErrorsJson: errors,
    });
    try {
      if (!(await topUpQuestions(usedProvider))) {
        result = autoFix(await usedProvider.repairObjective(input, result, errors, trackUsage));
        errors = validateAttempt(entry.objective, result, sourceExcerpts, input);
      }
    } catch (error) {
      errors = [(error as Error).message];
      break;
    }
    attempts++;
  }

  // Abschnitt 6/11: nach den günstigen Versuchen EIN Reparaturversuch mit dem Reparatur-Modell - aber nur, wenn das
  // tatsächlich ein anderes Modell ist. Standardmäßig sind beide gemini-3.8-flash; dann wäre es nur ein weiterer
  // identischer Versuch zum vollen Preis.
  if (errors.length > 0 && deps.repairProvider.model !== deps.contentProvider.model) {
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "repairing",
      attempts,
      provider: deps.repairProvider.name,
      model: deps.repairProvider.model,
      validationErrorsJson: errors,
    });
    try {
      usedProvider = deps.repairProvider;
      if (!(await topUpQuestions(usedProvider))) {
        result = autoFix(await usedProvider.repairObjective(input, result, errors, trackUsage));
        errors = validateAttempt(entry.objective, result, sourceExcerpts, input);
      }
      attempts++;
    } catch (error) {
      errors = [...errors, (error as Error).message];
    }
  }

  if (errors.length > 0) {
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "failed",
      attempts,
      provider: usedProvider.name,
      model: usedProvider.model,
      costUsd: attemptCostUsd.toString(),
      validationErrorsJson: errors,
    });
    return { success: false, content: null, errors, costUsd: attemptCostUsd };
  }

  await updateCourseGenerationObjective(objectiveRowId, {
    status: "valid",
    attempts,
    provider: usedProvider.name,
    model: usedProvider.model,
    costUsd: attemptCostUsd.toString(),
    contentJson: result,
    validationErrorsJson: [],
  });
  return { success: true, content: result, errors: [], costUsd: attemptCostUsd };
}

function validateAttempt(
  objective: CourseBlueprintObjective,
  result: ObjectiveContentResponse,
  sourceExcerpts: { locator: string; text: string }[],
  mode: { withQuestions?: boolean },
): string[] {
  const schemaCheck = (mode.withQuestions === false ? objectiveContentNoQuestionsResponseSchema : objectiveContentResponseSchema).safeParse(result);
  if (!schemaCheck.success) {
    return schemaCheck.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
  return validateObjectiveContent(objective, result, sourceExcerpts, { withQuestions: mode.withQuestions });
}

/**
 * course_generation.md Abschnitt 3, kompletter Ablauf EINES Jobs -
 * Preflight (Gate A) -> Blueprint (Gate B) -> Kostenschätzung -> Canary
 * (Gate C) -> progressive Batches mit Circuit Breaker (Gate D) ->
 * Vollständigkeitsprüfung -> Import -> ggf. Publish. Läuft in-process
 * (kein separater Worker-Container, siehe course_generation.md Abschnitt 0 -
 * dieselbe Begründung wie beim bestehenden content_generation_jobs-Muster:
 * ein separater Prozess ist eine Skalierungs-/Härtungsfrage, keine
 * Korrektheitsfrage für die aktuelle Ein-Server-Größenordnung).
 */
/**
 * Abschnitt 7 (retry-Endpunkt für einen `package_ready`-Job, autoPublish
 * war false): importiert das bereits vollständig generierte und validierte
 * `packageJson` direkt, OHNE den kompletten Worker erneut zu durchlaufen -
 * anders als bei einem gescheiterten Job (siehe executeCourseGenerationJob's
 * Resume-Logik pro Objective) gibt es hier nichts mehr zu generieren, nur
 * noch die bewusst zurückgehaltene Freigabe.
 */
function importOwner(job: CourseGenerationJob) {
  return job.organizationId
    ? { organizationId: job.organizationId, includeSectionQuizzes: job.includeSectionQuizzes, includeFinalExam: job.includeFinalExam }
    : undefined;
}

export async function publishPreparedCourseGenerationPackage(jobId: string): Promise<void> {
  const job = await getCourseGenerationJob(jobId);
  if (!job) throw new Error(`Job ${jobId} nicht gefunden.`);
  if (job.status !== "package_ready" || !job.packageJson) {
    throw new Error(`Job ${jobId} hat kein freigabebereites Paket (Status: ${job.status}).`);
  }

  const pkgValidation = coursePackageV1Schema.safeParse(job.packageJson);
  if (!pkgValidation.success) {
    await markCourseGenerationJobFailed(
      jobId,
      "internal",
      `Gespeichertes CoursePackageV1 ist nicht mehr gültig: ${pkgValidation.error.message}`,
    );
    return;
  }

  try {
    await updateCourseGenerationJob(jobId, { status: "importing", message: "Kurs wird importiert …" });
    const imported = await importCoursePackage(pkgValidation.data, job.organizationId ? plannedSlugFor(job) : undefined, importOwner(job));
    await applyCourseGroup(job, imported.certificationId);
    await updateCourseGenerationJob(jobId, {
      status: "published",
      resultCertificationId: imported.certificationId,
      message: `Veröffentlicht: ${imported.slug} (${imported.objectiveCount} Objective(s), ${imported.questionCount} Frage(n)).`,
      completedAt: new Date(),
    });
    // PSRP-HR Phase 7.1: Konzepte und Abfragevarianten ergänzen (Hintergrund, best effort).
    tagConceptsAfterGeneration(imported.certificationId, job.organizationId);
  } catch (error) {
    await handleJobFailure(jobId, error);
  }
}

/** UI U7: Kursgruppe und Kurzcode aus dem Auftrag auf den fertigen allgemeinen Kurs übertragen (auditiert). Ein Fehler hier stoppt den Import nicht. */
async function applyCourseGroup(job: { organizationId: string | null; courseType: "certification" | "custom"; categoryId: string | null; shortCode: string | null; requestedByUserId: string | null }, certificationId: string): Promise<void> {
  if (job.organizationId) return;
  try {
    if (job.courseType === "custom") await getDb().update(certifications).set({ courseType: "custom" }).where(eq(certifications.id, certificationId));
    if (!job.categoryId && !job.shortCode) return;
    await getDb().update(certifications).set({ categoryId: job.categoryId, shortCode: job.shortCode }).where(eq(certifications.id, certificationId));
    if (job.categoryId) await getDb().insert(certificationCategories).values({ certificationId, categoryId: job.categoryId }).onConflictDoNothing();
    await recordAuditEvent({ actorUserId: job.requestedByUserId, action: "course_category.assign", targetType: "certification", targetId: certificationId, metadata: { from: null, to: job.categoryId, via: "generation" } });
  } catch (error) {
    console.error("Kursgruppe konnte nicht gesetzt werden:", error);
  }
}

export async function executeCourseGenerationJob(
  jobId: string,
  depsOverride?: Partial<CourseGenerationDeps>,
): Promise<void> {
  const job = await getCourseGenerationJob(jobId);
  if (!job) throw new Error(`Job ${jobId} nicht gefunden.`);
  let deps!: CourseGenerationDeps;

  /** Kooperative Abbruchprüfung: `POST .../cancel` (Phase 3) setzt den
   * DB-Status auf "cancelled" - der Worker selbst hat keinen Zugriff auf den
   * anfragenden Request, prüft daher zwischen den Schritten aktiv nach statt
   * eine externe Unterbrechung zu erzwingen (kein AbortController über die
   * gesamte Aufrufkette). */
  const checkNotCancelled = async () => {
    const current = await getCourseGenerationJob(jobId);
    if (current?.status === "cancelled") {
      throw new JobCancelledError("Auftrag wurde abgebrochen.");
    }
  };

  // Bei einer Fortsetzung zählen die Kosten der früheren Läufe in der Anzeige mit (vorher begann sie wieder bei 0).
  // Das Sicherheitslimit gilt wie bisher je Lauf; automatische Fortsetzungen sind auf MAX_AUTO_RESUMES begrenzt.
  const previousSpendUsd = Number(job.actualCostUsd) || 0;
  let spentUsd = 0;
  let initialLimitWarningShown = false;
  /**
   * Abschnitt 12: zweistufiges Budget - `initialCostLimitUsd` ist ein
   * Zielwert (bei Überschreitung würde man laut Dokument zuerst zusätzliche
   * Übungsfragen reduzieren, siehe dortige Budgetlogik Punkt 3 - diese
   * dynamische Reduktion ist hier NICHT implementiert, nur die Warnung
   * selbst, das wäre eine deutlich größere Änderung an der bereits
   * abgeschlossenen Blueprint-Fragenverteilung). `absoluteCostLimitUsd` ist
   * das harte, nie zu überschreitende Limit - bricht den Job sofort ab.
   */
  const recordSpend = async (delta: number) => {
    spentUsd += delta;
    const values: { actualCostUsd: string; message?: string } = { actualCostUsd: (previousSpendUsd + spentUsd).toString() };
    if (!initialLimitWarningShown && spentUsd >= Number(job.initialCostLimitUsd)) {
      initialLimitWarningShown = true;
      values.message = `Zielbudget ($${job.initialCostLimitUsd}) erreicht, läuft weiter bis zum Sicherheitslimit ($${job.absoluteCostLimitUsd}) …`;
    }
    await updateCourseGenerationJob(jobId, values);
    if (spentUsd >= Number(job.absoluteCostLimitUsd)) {
      throw new BudgetExceededError(
        `Absolutes Kostenlimit erreicht: $${spentUsd.toFixed(4)} >= $${job.absoluteCostLimitUsd}.`,
      );
    }
  };

  try {
    // Gate A: Preflight
    await updateCourseGenerationJob(jobId, {
      status: "preflight",
      phase: "preflight",
      message: "Technischer Preflight läuft …",
    });
    deps = { ...(await defaultDeps(job, depsOverride)), ...depsOverride };
    if (!job.organizationId && job.sourceUrls.length === 0) {
      throw new PreflightError("Mindestens eine Quelle (sourceUrls) ist erforderlich.");
    }
    if (job.organizationId && !job.documentId && !(await hasJobDocuments(jobId))) {
      throw new PreflightError("Für einen internen Kurs ist mindestens eine Datei erforderlich.");
    }
    // Der Slug-Kollisionscheck in importCoursePackage() greift erst GANZ am
    // Ende (nach Blueprint + allen Objective-Aufrufen) - ohne diesen
    // Vorab-Check würde ein Titel, der auf eine bereits bestehende
    // Zertifizierung slug-t, den kompletten (teuren) Lauf verschwenden, bevor
    // der Import ihn verwirft. Prüft hier, VOR jeglichem KI-Aufruf.
    const plannedSlug = plannedSlugFor(job);
    const existingCert = await getDb()
      .select({ id: certifications.id })
      .from(certifications)
      .where(eq(certifications.slug, plannedSlug))
      .limit(1);
    if (existingCert.length > 0) {
      throw new PreflightError(
        `Zertifizierung mit Slug "${plannedSlug}" existiert bereits - wähle einen anderen Titel/eine andere Zertifizierungsversion, ` +
          `um sie nicht zu überschreiben (der Kurs-Generator legt immer eine neue, unabhängige Zertifizierung an - bestehende Inhalte werden nie ersetzt).`,
      );
    }
    let sources: FetchedSource[];
    try {
      sources =
        job.organizationId && (job.documentId || (await hasJobDocuments(jobId)))
          ? await deps.loadDocumentSourcesFn(job.organizationId, jobId, deps.describeImageFn, job.documentId)
          : await deps.fetchSourcesFn(job.sourceUrls);
    } catch (error) {
      if (error instanceof DocumentSourceError) throw new PreflightError(error.message);
      // fetchSource() wirft SourceFetchError (siehe sources.ts) - das ist
      // GENAU der in Gate A beschriebene Fehlerfall ("Erreichbarkeit ...
      // der Quellen"), muss also als PreflightError enden, nicht als
      // generischer "failed"-Status.
      throw new PreflightError((error as Error).message);
    }

    // Was die Quellen hergeben (offizielle Lernziel-Nummern, gekürzte Quellen) für den Qualitätsbericht festhalten.
    // Reine Zusatzinformation: ein Fehler hier darf den Auftrag nie aufhalten.
    try {
      await updateCourseGenerationJob(jobId, { sourceReport: buildSourceReport(sources) });
    } catch (error) {
      console.error("[course-generation] Quellenbericht nicht gespeichert:", error);
    }

    // Stichwortliste statt Text? Dann leitet die KI Lernziele aus den Stichwörtern ab und ergänzt Erklärungen.
    // Beschreibungen von Screenshots (Locator „Bild: …“) zählen nicht mit: sie sind ausformulierte KI-Texte.
    const outline = looksLikeOutline(sources.flatMap((s) => s.excerpts.filter((e) => !e.locator.startsWith("Bild:")).map((e) => e.text)));

    // Blueprint. Bei einer Fortsetzung (erneuter Versuch, automatische Fortsetzung nach Neustart) wird der bereits
    // erzeugte Blueprint wiederverwendet: Ein neuer kostet einen Aufruf und hätte andere Lernziele, zu denen die schon
    // fertigen Lernziel-Inhalte (gespeichert je Blueprint-Lernziel-ID) nicht mehr passen würden.
    // Nur ein gültiger: ein gespeicherter, aber von Gate B verworfener Blueprint würde sonst bei jedem Versuch erneut scheitern.
    const storedBlueprint = job.blueprintJson ? courseBlueprintV1Schema.safeParse(job.blueprintJson) : null;
    let blueprint: CourseBlueprintV1;
    if (storedBlueprint?.success && validateBlueprint(storedBlueprint.data).length === 0) {
      blueprint = storedBlueprint.data;
      await updateCourseGenerationJob(jobId, {
        status: "blueprint_validating",
        phase: "blueprint",
        message: "Vorhandener Blueprint wird weiterverwendet …",
      });
    } else {
      await updateCourseGenerationJob(jobId, {
        status: "blueprint_generating",
        phase: "blueprint",
        message: `Blueprint wird mit ${deps.blueprintProvider.model} erstellt …${sources.flatMap((x) => x.warnings ?? []).map((w) => ` Hinweis: ${w}`).join("")}`,
      });
      // Kosten synchron im Callback aufsummieren statt async recordSpend() im
      // Callback selbst aufzurufen - ein dort geworfener BudgetExceededError
      // würde sonst nicht in diesem try/catch landen, sondern als unhandled
      // rejection enden (derselbe Grund, aus dem generateAndValidateObjective
      // die Kosten zurückgibt statt sie selbst zu verbuchen).
      let blueprintCostUsd = 0;
      const blueprintResult = await deps.blueprintProvider.generateBlueprint(
        {
          courseTitle: job.courseTitle,
          courseDescription: job.courseDescription,
          language: job.language as "de" | "en",
          outline,
          provider: job.provider,
          certificationVersion: job.certificationVersion ?? undefined,
          courseType: job.courseType,
          sources,
        },
        (usage) => {
          const cost = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model, usage.cachedTokens);
          if (cost !== null) blueprintCostUsd += cost;
          void touchCourseGenerationJob(jobId).catch(() => undefined);
        },
      );
      await recordSpend(blueprintCostUsd);
      blueprint = { ...blueprintResult, requestId: jobId };
    }

    // Gate B: Blueprint-Validierung
    await updateCourseGenerationJob(jobId, {
      status: "blueprint_validating",
      blueprintJson: blueprint,
    });
    const blueprintErrors = validateBlueprint(blueprint);
    if (blueprintErrors.length > 0) {
      throw new BlueprintValidationError(blueprintErrors.join("; "));
    }

    const allObjectives: ObjectiveEntry[] = blueprint.domains.flatMap((domain) =>
      domain.objectives.map((objective) => ({ domain, objective })),
    );
    if (allObjectives.length > HARD_MAX_OBJECTIVES) {
      // Firmenkurse aus Dateien teilen sich die hochgeladenen Dateien mit dem Auftrag: dort weiterhin abbrechen.
      if (job.organizationId) {
        throw new BlueprintValidationError(
          `${allObjectives.length} Objectives überschreiten das Hard-Limit von ${HARD_MAX_OBJECTIVES} - bitte die Unterlagen auf mehrere Lernpfade aufteilen.`,
        );
      }
      // Sehr großer Kurs: in Teile aufteilen (split.ts). Dieser Auftrag erzeugt Teil 1, die übrigen laufen danach als
      // eigene Aufträge mit ihrem Teil-Blueprint. Kein Lernziel geht verloren.
      const parts = splitBlueprint(blueprint, HARD_MAX_OBJECTIVES);
      const baseTitle = job.courseTitle;
      const language = job.language as "de" | "en";
      await createSplitPartJobs(
        job,
        parts.slice(1).map((p, i) => ({ title: partTitle(baseTitle, i + 2, parts.length, language), blueprint: { ...p, title: partTitle(blueprint.title, i + 2, parts.length, language) } })),
        parts.length,
      );
      const title = partTitle(baseTitle, 1, parts.length, language);
      blueprint = { ...parts[0], title: partTitle(blueprint.title, 1, parts.length, language) };
      job.courseTitle = title;
      job.splitPart = 1;
      job.splitParts = parts.length;
      await updateCourseGenerationJob(jobId, {
        courseTitle: title,
        splitPart: 1,
        splitParts: parts.length,
        blueprintJson: blueprint,
        message: `Kurs mit ${allObjectives.length} Lernzielen in ${parts.length} Teile aufgeteilt; Teil 1 wird erzeugt, die übrigen folgen nacheinander.`,
      });
      allObjectives.splice(0, allObjectives.length, ...blueprint.domains.flatMap((domain) => domain.objectives.map((objective) => ({ domain, objective }))));
    }

    // Kostenschätzung (grob, siehe course_generation.md Abschnitt 12)
    await updateCourseGenerationJob(jobId, { status: "cost_estimating" });
    const roughEstimate = estimateCostUsd(
      allObjectives.length * 1_500,
      allObjectives.length * 3_500,
      deps.contentProvider.model,
    );
    await updateCourseGenerationJob(jobId, {
      estimatedCostUsd: roughEstimate === null ? null : roughEstimate.toString(),
      status: "blueprint_ready",
      message:
        `Blueprint bereit: ${blueprint.domains.length} Domain(s), ${allObjectives.length} Objective(s).` +
        (outline ? " Die Quelle ist überwiegend eine Stichwortliste: Erklärungen werden aus Fachwissen ergänzt, bitte den Entwurf genau prüfen." : ""),
    });

    const canaryIndex = pickCanaryIndex(allObjectives);
    const objectiveRows = new Map<string, CourseGenerationObjectiveRow>();
    for (const [index, entry] of allObjectives.entries()) {
      // upsertCourseGenerationObjective() ist idempotent (siehe dort) - bei
      // einem retry auf demselben Job liefert es die BEREITS vorhandene
      // Zeile zurück, deren status/contentJson unten den Resume-Kurzschluss
      // ermöglicht (Phase 2-Abnahme: "Ein unterbrochener Job wird nach
      // Neustart automatisch korrekt fortgesetzt").
      const row = await upsertCourseGenerationObjective(
        jobId,
        entry.domain.id,
        entry.objective.id,
        entry.objective.code,
        index === canaryIndex,
      );
      objectiveRows.set(entry.objective.id, row);
    }

    // Gate C: Canary
    const canaryEntry = allObjectives[canaryIndex];
    await updateCourseGenerationJob(jobId, {
      status: "canary_generating",
      phase: "canary",
      message: `Canary-Lernziel "${canaryEntry.objective.title}" wird erzeugt …`,
    });
    const canaryResult = await generateAndValidateObjective(
      jobId,
      objectiveRows.get(canaryEntry.objective.id)!,
      deps,
      job,
      canaryEntry,
      sources,
      MAX_CANARY_ATTEMPTS,
      outline,
    );
    await recordSpend(canaryResult.costUsd);
    if (!canaryResult.success) {
      await updateCourseGenerationJob(jobId, { status: "canary_failed" });
      throw new CanaryFailedError(
        `Canary-Lernziel "${canaryEntry.objective.title}" fehlgeschlagen: ${canaryResult.errors.join("; ")}`,
      );
    }

    // Gate D: progressive Batches
    const results = new Map<string, ObjectiveEntry & { content: ObjectiveContentResponse }>();
    results.set(canaryEntry.objective.id, { ...canaryEntry, content: canaryResult.content! });

    const remaining = allObjectives.filter((_, index) => index !== canaryIndex);
    await updateCourseGenerationJob(jobId, { status: "content_generating", phase: "content" });

    let processed = 0;
    let batchSize = INITIAL_BATCH_SIZE;
    const errorCounts = new Map<string, number>();
    const failedEntries: ObjectiveEntry[] = [];
    let circuitOpenMessage: string | null = null;

    while (processed < remaining.length) {
      await checkNotCancelled();
      const batch = remaining.slice(processed, processed + batchSize);
      await updateCourseGenerationJob(jobId, {
        status: "batch_generating",
        message: `Batch: Objective ${processed + 1}-${processed + batch.length} von ${remaining.length}`,
      });

      let batchFailures = 0;
      for (const entry of batch) {
        // Abbruch je Lernziel prüfen, nicht nur je Batch: ein Klick auf „Abbrechen“ greift so nach höchstens einem Lernziel.
        await checkNotCancelled();
        const result = await generateAndValidateObjective(
          jobId,
          objectiveRows.get(entry.objective.id)!,
          deps,
          job,
          entry,
          sources,
          MAX_REPAIR_ATTEMPTS,
          outline,
        );
        await recordSpend(result.costUsd);
        if (result.success) {
          results.set(entry.objective.id, { ...entry, content: result.content! });
        } else {
          batchFailures++;
          failedEntries.push(entry);
          const errorKey = result.errors[0] ?? "unbekannter Fehler";
          // Vorübergehende API-Fehler (Netz, 429/503, Zeitüberschreitung) sind kein „immer gleicher Inhaltsfehler“: sie
          // lösen den Fehlerschutz für identische Fehler nicht aus (die Fehlerquote je Batch zählt sie weiterhin).
          if (!isRetryableError(new Error(errorKey))) errorCounts.set(errorKey, (errorCounts.get(errorKey) ?? 0) + 1);
        }
      }

      const batchErrorRate = batchFailures / batch.length;
      const maxIdenticalHit = [...errorCounts.entries()].find(
        ([, count]) => count >= MAX_IDENTICAL_ERRORS,
      );
      if (batchErrorRate > MAX_BATCH_ERROR_RATE) {
        circuitOpenMessage = `Fehlerquote im Batch (${(batchErrorRate * 100).toFixed(0)}%) über dem Grenzwert (${(MAX_BATCH_ERROR_RATE * 100).toFixed(0)}%).${topErrorHint(errorCounts)}`;
        break;
      }
      if (maxIdenticalHit) {
        circuitOpenMessage = `Derselbe Fehler ist ${maxIdenticalHit[1]}-mal aufgetreten: "${maxIdenticalHit[0]}".`;
        break;
      }

      processed += batch.length;
      batchSize = GENERATION_BATCH_SIZE;
    }

    if (circuitOpenMessage) {
      await updateCourseGenerationJob(jobId, { status: "circuit_breaker_open", message: circuitOpenMessage });
      throw new CircuitBreakerOpenError(circuitOpenMessage);
    }

    // Zweiter Durchgang: einzelne gescheiterte Lernziele (unterhalb der Fehlerschwelle) werden noch einmal erzeugt,
    // bevor der ganze Lauf daran scheitert. Vorher endete jeder Lauf mit auch nur einem gescheiterten Lernziel erst
    // beim Zusammensetzen des Pakets und musste von Hand neu gestartet werden.
    if (failedEntries.length > 0) {
      await updateCourseGenerationJob(jobId, {
        status: "repairing",
        message: `Zweiter Versuch für ${failedEntries.length} Lernziel(e) …`,
      });
      const stillFailed: string[] = [];
      for (const entry of failedEntries) {
        await checkNotCancelled();
        const row = await upsertCourseGenerationObjective(jobId, entry.domain.id, entry.objective.id, entry.objective.code, false);
        const result = await generateAndValidateObjective(jobId, row, deps, job, entry, sources, MAX_REPAIR_ATTEMPTS, outline);
        await recordSpend(result.costUsd);
        if (result.success) results.set(entry.objective.id, { ...entry, content: result.content! });
        else stillFailed.push(`${entry.objective.code}: ${result.errors[0] ?? "unbekannter Fehler"}`);
      }
      if (stillFailed.length > 0) {
        throw new Error(
          `${stillFailed.length} Lernziel(e) konnten auch im zweiten Versuch nicht erzeugt werden (${stillFailed.slice(0, 3).join(" | ").slice(0, 600)}). ` +
            "„Erneut versuchen“ setzt bei diesen Lernzielen fort; fertige bleiben erhalten.",
        );
      }
    }
    await checkNotCancelled();

    // Vollständige Kursvalidierung + Paket zusammensetzen
    await updateCourseGenerationJob(jobId, {
      status: "validating",
      message: "Vollständige Kursvalidierung …",
    });
    const pkg = assembleCoursePackage(job, blueprint, results, deps);
    const pkgValidation = coursePackageV1Schema.safeParse(pkg);
    if (!pkgValidation.success) {
      throw new Error(`Zusammengesetztes CoursePackageV1 ist ungültig: ${pkgValidation.error.message}`);
    }
    await updateCourseGenerationJob(jobId, { packageJson: pkgValidation.data });

    if (!job.autoPublish) {
      await updateCourseGenerationJob(jobId, {
        status: "package_ready",
        message: "Kurs vollständig generiert und validiert - wartet auf manuelle Freigabe (autoPublish=false).",
        completedAt: new Date(),
      });
      return;
    }

    await checkNotCancelled();
    await updateCourseGenerationJob(jobId, { status: "importing", message: "Kurs wird importiert …" });
    const imported = await importCoursePackage(pkgValidation.data, job.organizationId ? plannedSlugFor(job) : undefined, importOwner(job));
    await applyCourseGroup(job, imported.certificationId);
    await updateCourseGenerationJob(jobId, {
      status: "published",
      resultCertificationId: imported.certificationId,
      message: `Veröffentlicht: ${imported.slug} (${imported.objectiveCount} Objective(s), ${imported.questionCount} Frage(n)).`,
      completedAt: new Date(),
    });
    // PSRP-HR Phase 7.1: Konzepte und Abfragevarianten ergänzen (Hintergrund, best effort).
    tagConceptsAfterGeneration(imported.certificationId, job.organizationId);
  } catch (error) {
    await handleJobFailure(jobId, error);
  }
}

async function handleJobFailure(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof JobCancelledError) {
    // Status ist bereits "cancelled" (vom cancel-Endpunkt gesetzt) - nur
    // completedAt nachtragen, kein errorCode/-message für eine gewollte
    // Nutzeraktion.
    await updateCourseGenerationJob(jobId, { message, completedAt: new Date() });
  } else if (error instanceof PreflightError) {
    await markCourseGenerationJobFailed(jobId, "preflight_failed", message, "preflight_failed");
  } else if (error instanceof BlueprintValidationError) {
    await markCourseGenerationJobFailed(jobId, "blueprint_invalid", message, "failed");
  } else if (error instanceof CanaryFailedError) {
    await markCourseGenerationJobFailed(jobId, "canary_failed", message, "canary_failed");
  } else if (error instanceof CircuitBreakerOpenError) {
    await markCourseGenerationJobFailed(jobId, "circuit_breaker_open", message, "circuit_breaker_open");
  } else if (error instanceof BudgetExceededError) {
    await markCourseGenerationJobFailed(jobId, "cost_limit_reached", message, "cost_limit_reached");
  } else {
    await markCourseGenerationJobFailed(jobId, "internal", message, "failed");
  }
}

/** Abschnitt 3.7: setzt den validierten Blueprint + alle generierten
 * Objective-Inhalte zu einem vollständigen `CoursePackageV1` zusammen. */
function assembleCoursePackage(
  job: CourseGenerationJob,
  blueprint: CourseBlueprintV1,
  results: Map<string, ObjectiveEntry & { content: ObjectiveContentResponse }>,
  deps: CourseGenerationDeps,
): CoursePackageV1 {
  const domains: CoursePackageDomain[] = blueprint.domains.map((domain) => ({
    ...domain,
    objectives: domain.objectives.map((objective) => {
      const result = results.get(objective.id);
      if (!result) {
        throw new Error(`Kein generierter Inhalt für Objective "${objective.code}" gefunden.`);
      }
      return { ...objective, sections: result.content.sections, questions: result.content.questions };
    }),
  }));

  return {
    ...blueprint,
    schemaVersion: COURSE_PACKAGE_SCHEMA_VERSION,
    domains,
    generation: {
      blueprintProvider: deps.blueprintProvider.name,
      blueprintModel: deps.blueprintProvider.model,
      contentProvider: deps.contentProvider.name,
      contentModel: deps.contentProvider.model,
      promptVersion: "course-generation-v1",
      generatedAt: new Date().toISOString(),
    },
  };
}
