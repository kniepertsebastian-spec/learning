import type { AIUsage } from "@/lib/ai/generate";
import { estimateCostUsd } from "@/lib/server/admin/content-generation";
import {
  getCourseGenerationJob,
  markCourseGenerationJobFailed,
  updateCourseGenerationJob,
  updateCourseGenerationObjective,
  upsertCourseGenerationObjective,
  type CourseGenerationJob,
  type CourseGenerationObjectiveRow,
} from "./job-service";
import { importCoursePackage, suggestCourseSlug } from "./importer";
import {
  anthropicHaikuContentProvider,
  anthropicSonnetRepairProvider,
  resolveBlueprintProvider,
  type BlueprintProvider,
  type CourseContentProvider,
} from "./providers";
import {
  coursePackageV1Schema,
  objectiveContentResponseSchema,
  COURSE_PACKAGE_SCHEMA_VERSION,
  type CourseBlueprintDomain,
  type CourseBlueprintObjective,
  type CourseBlueprintV1,
  type CoursePackageDomain,
  type CoursePackageV1,
  type ObjectiveContentResponse,
} from "./schemas";
import { fetchSources, type FetchedSource } from "./sources";
import { pickCanaryIndex, validateBlueprint, validateObjectiveContent } from "./validation";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";

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

export interface CourseGenerationDeps {
  blueprintProvider: BlueprintProvider;
  contentProvider: CourseContentProvider;
  repairProvider: CourseContentProvider;
  fetchSourcesFn: (urls: string[]) => Promise<FetchedSource[]>;
}

function defaultDeps(job: CourseGenerationJob): CourseGenerationDeps {
  return {
    blueprintProvider: resolveBlueprintProvider(job.blueprintProvider),
    contentProvider: anthropicHaikuContentProvider,
    repairProvider: anthropicSonnetRepairProvider,
    fetchSourcesFn: fetchSources,
  };
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
): Promise<ObjectiveRunResult> {
  const objectiveRowId = objectiveRow.id;

  // Resume nach Unterbrechung/Retry (Phase 2-Abnahme): ein bereits als
  // "valid" gespeichertes Objective wird NICHT erneut generiert - spart
  // Tokens/Kosten und macht "Retry" auf einem teilweise erfolgreichen Job
  // sinnvoll statt alles neu zu erzeugen.
  if (objectiveRow.status === "valid" && objectiveRow.contentJson) {
    const cached = objectiveContentResponseSchema.safeParse(objectiveRow.contentJson);
    if (cached.success) {
      return { success: true, content: cached.data, errors: [], costUsd: 0 };
    }
  }

  const sourceExcerpts = sources.flatMap((source) =>
    entry.objective.sourceLocators.length === 0
      ? source.excerpts
      : source.excerpts.filter((excerpt) => entry.objective.sourceLocators.includes(excerpt.locator)),
  );
  const input = {
    courseTitle: job.courseTitle,
    language: job.language as "de" | "en",
    domain: entry.domain,
    objective: entry.objective,
    sourceExcerpts,
  };

  await updateCourseGenerationObjective(objectiveRowId, { status: "generating" });

  let attemptCostUsd = 0;
  const trackUsage = (usage: AIUsage) => {
    const cost = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model);
    if (cost !== null) attemptCostUsd += cost;
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

  let errors = validateAttempt(entry.objective, result, sourceExcerpts);
  let usedProvider = deps.contentProvider;
  let attempts = 1;

  while (errors.length > 0 && attempts < maxAttempts) {
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "repairing",
      attempts,
      validationErrorsJson: errors,
    });
    try {
      result = await usedProvider.repairObjective(input, result, errors, trackUsage);
    } catch (error) {
      errors = [(error as Error).message];
      break;
    }
    errors = validateAttempt(entry.objective, result, sourceExcerpts);
    attempts++;
  }

  if (errors.length > 0) {
    // Abschnitt 6/11: nach den günstigen Versuchen EIN gesammelter
    // Sonnet-Reparaturversuch, bevor das Objective endgültig scheitert.
    await updateCourseGenerationObjective(objectiveRowId, {
      status: "repairing",
      attempts,
      provider: deps.repairProvider.name,
      model: deps.repairProvider.model,
      validationErrorsJson: errors,
    });
    try {
      usedProvider = deps.repairProvider;
      result = await usedProvider.repairObjective(input, result, errors, trackUsage);
      errors = validateAttempt(entry.objective, result, sourceExcerpts);
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
): string[] {
  const schemaCheck = objectiveContentResponseSchema.safeParse(result);
  if (!schemaCheck.success) {
    return schemaCheck.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
  return validateObjectiveContent(objective, result, sourceExcerpts);
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
    const imported = await importCoursePackage(pkgValidation.data);
    await updateCourseGenerationJob(jobId, {
      status: "published",
      resultCertificationId: imported.certificationId,
      message: `Veröffentlicht: ${imported.slug} (${imported.objectiveCount} Objective(s), ${imported.questionCount} Frage(n)).`,
      completedAt: new Date(),
    });
  } catch (error) {
    await handleJobFailure(jobId, error);
  }
}

export async function executeCourseGenerationJob(
  jobId: string,
  depsOverride?: Partial<CourseGenerationDeps>,
): Promise<void> {
  const job = await getCourseGenerationJob(jobId);
  if (!job) throw new Error(`Job ${jobId} nicht gefunden.`);
  const deps: CourseGenerationDeps = { ...defaultDeps(job), ...depsOverride };

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
    const values: { actualCostUsd: string; message?: string } = { actualCostUsd: spentUsd.toString() };
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
    if (job.sourceUrls.length === 0) {
      throw new PreflightError("Mindestens eine Quelle (sourceUrls) ist erforderlich.");
    }
    // Der Slug-Kollisionscheck in importCoursePackage() greift erst GANZ am
    // Ende (nach Blueprint + allen Objective-Aufrufen) - ohne diesen
    // Vorab-Check würde ein Titel, der auf eine bereits bestehende
    // Zertifizierung slug-t, den kompletten (teuren) Lauf verschwenden, bevor
    // der Import ihn verwirft. Prüft hier, VOR jeglichem KI-Aufruf.
    const plannedSlug = suggestCourseSlug(job.courseTitle, job.certificationVersion ?? undefined);
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
      sources = await deps.fetchSourcesFn(job.sourceUrls);
    } catch (error) {
      // fetchSource() wirft SourceFetchError (siehe sources.ts) - das ist
      // GENAU der in Gate A beschriebene Fehlerfall ("Erreichbarkeit ...
      // der Quellen"), muss also als PreflightError enden, nicht als
      // generischer "failed"-Status.
      throw new PreflightError((error as Error).message);
    }

    // Blueprint
    await updateCourseGenerationJob(jobId, {
      status: "blueprint_generating",
      phase: "blueprint",
      message: `Blueprint wird über ${deps.blueprintProvider.name} erstellt …`,
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
        provider: job.provider,
        certificationVersion: job.certificationVersion ?? undefined,
        sources,
      },
      (usage) => {
        const cost = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model);
        if (cost !== null) blueprintCostUsd += cost;
      },
    );
    await recordSpend(blueprintCostUsd);
    const blueprint: CourseBlueprintV1 = { ...blueprintResult, requestId: jobId };

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
      throw new BlueprintValidationError(
        `${allObjectives.length} Objectives überschreiten das Hard-Limit von ${HARD_MAX_OBJECTIVES} - Kurs muss aufgeteilt werden.`,
      );
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
      message: `Blueprint bereit: ${blueprint.domains.length} Domain(s), ${allObjectives.length} Objective(s).`,
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
        const result = await generateAndValidateObjective(
          jobId,
          objectiveRows.get(entry.objective.id)!,
          deps,
          job,
          entry,
          sources,
          MAX_REPAIR_ATTEMPTS,
        );
        await recordSpend(result.costUsd);
        if (result.success) {
          results.set(entry.objective.id, { ...entry, content: result.content! });
        } else {
          batchFailures++;
          const errorKey = result.errors[0] ?? "unbekannter Fehler";
          errorCounts.set(errorKey, (errorCounts.get(errorKey) ?? 0) + 1);
        }
      }

      const batchErrorRate = batchFailures / batch.length;
      const maxIdenticalHit = [...errorCounts.entries()].find(
        ([, count]) => count >= MAX_IDENTICAL_ERRORS,
      );
      if (batchErrorRate > MAX_BATCH_ERROR_RATE) {
        circuitOpenMessage = `Fehlerquote im Batch (${(batchErrorRate * 100).toFixed(0)}%) über dem Grenzwert (${(MAX_BATCH_ERROR_RATE * 100).toFixed(0)}%).`;
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

    await updateCourseGenerationJob(jobId, { status: "importing", message: "Kurs wird importiert …" });
    const imported = await importCoursePackage(pkgValidation.data);
    await updateCourseGenerationJob(jobId, {
      status: "published",
      resultCertificationId: imported.certificationId,
      message: `Veröffentlicht: ${imported.slug} (${imported.objectiveCount} Objective(s), ${imported.questionCount} Frage(n)).`,
      completedAt: new Date(),
    });
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
