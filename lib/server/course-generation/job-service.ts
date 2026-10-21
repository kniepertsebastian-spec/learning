import { and, desc, eq, inArray, isNull, lt, max, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  courseGenerationJobs,
  courseGenerationObjectives,
  TERMINAL_COURSE_GENERATION_JOB_STATUSES,
  type CourseGenerationJobStatus,
} from "@/lib/server/db/schema";

export type CourseGenerationJob = typeof courseGenerationJobs.$inferSelect;
export type CourseGenerationObjectiveRow = typeof courseGenerationObjectives.$inferSelect;

export function isTerminalCourseGenerationStatus(status: CourseGenerationJobStatus): boolean {
  return (TERMINAL_COURSE_GENERATION_JOB_STATUSES as string[]).includes(status);
}

export class DuplicateCourseGenerationJobError extends Error {}

export interface CreateCourseGenerationJobInput {
  requestedByUserId: string;
  courseTitle: string;
  courseDescription: string;
  language: "de" | "en";
  provider: string;
  certificationVersion?: string;
  /** Standard: Zertifikatskurs. "custom" = individuelles Training (freies Thema, keine Prüfung). */
  courseType?: "certification" | "custom";
  sourceUrls: string[];
  autoPublish: boolean;
  initialCostLimitUsd: number;
  absoluteCostLimitUsd: number;
  blueprintProvider: string;
  /** Nur bei internen Lernpfaden einer Firma (siehe createInternalCourseJob). */
  organizationId?: string;
  documentId?: string;
  /** Nur interne Lernpfade: Lektionstests und/oder Abschlussprüfung erzeugen (Standard ja). */
  includeSectionQuizzes?: boolean;
  includeFinalExam?: boolean;
  /** Nur allgemeine Kurse: Kursgruppe und Kurzcode für den fertigen Kurs. */
  categoryId?: string;
  shortCode?: string;
}

/**
 * course_generation.md Abschnitt 3.1: "erkennt doppelte aktive Aufträge".
 * Anders als `content_generation_jobs` (siehe R0.3) gibt es hier VOR dem
 * Import keine echte Zertifizierung, auf die ein DB-Unique-Index den Schutz
 * stützen könnte - der Titel ist die einzige natürliche Dedupe-Grundlage.
 * Rein App-seitiger Check (race-anfällig bei zwei fast gleichzeitigen
 * Klicks), akzeptabel für diese seltene, manuelle Admin-Aktion.
 */
export async function createCourseGenerationJob(
  input: CreateCourseGenerationJobInput,
): Promise<CourseGenerationJob> {
  const db = getDb();
  const activeJobs = await db
    .select({ id: courseGenerationJobs.id, courseTitle: courseGenerationJobs.courseTitle })
    .from(courseGenerationJobs)
    .where(
      and(
        notInArray(courseGenerationJobs.status, TERMINAL_COURSE_GENERATION_JOB_STATUSES),
        // Dublettenprüfung nur im eigenen Bereich: der Betreiber erfährt nicht, woran eine Firma arbeitet (und umgekehrt).
        input.organizationId
          ? eq(courseGenerationJobs.organizationId, input.organizationId)
          : isNull(courseGenerationJobs.organizationId),
      ),
    );
  const duplicate = activeJobs.find(
    (row) => row.courseTitle.trim().toLowerCase() === input.courseTitle.trim().toLowerCase(),
  );
  if (duplicate) {
    throw new DuplicateCourseGenerationJobError(
      `Es läuft bereits ein Generierungsauftrag für "${input.courseTitle}" (Job ${duplicate.id}).`,
    );
  }

  const [job] = await db
    .insert(courseGenerationJobs)
    .values({
      requestedByUserId: input.requestedByUserId,
      courseTitle: input.courseTitle,
      courseDescription: input.courseDescription,
      language: input.language,
      provider: input.provider,
      certificationVersion: input.courseType === "custom" ? undefined : input.certificationVersion,
      courseType: input.courseType ?? "certification",
      sourceUrls: input.sourceUrls,
      organizationId: input.organizationId,
      documentId: input.documentId,
      categoryId: input.organizationId ? undefined : input.categoryId,
      shortCode: input.organizationId ? undefined : input.shortCode,
      includeSectionQuizzes: input.includeSectionQuizzes ?? true,
      includeFinalExam: input.includeFinalExam ?? true,
      autoPublish: input.autoPublish,
      initialCostLimitUsd: input.initialCostLimitUsd.toString(),
      absoluteCostLimitUsd: input.absoluteCostLimitUsd.toString(),
      blueprintProvider: input.blueprintProvider,
      status: "queued",
      phase: "queued",
      message: "Auftrag angenommen …",
    })
    .returning();
  return job;
}

export async function getCourseGenerationJob(id: string): Promise<CourseGenerationJob | null> {
  const [job] = await getDb()
    .select()
    .from(courseGenerationJobs)
    .where(eq(courseGenerationJobs.id, id))
    .limit(1);
  return job ?? null;
}

/** Aufträge des Betreibers. Interne Lernpfade der Firmen (organization_id gesetzt) gehören nie dazu. */
/**
 * Auftrag für die Betreiberseite: interne Lernpfade einer Firma sind dort nicht vorhanden (null, wie "nicht gefunden").
 * Der Worker und die Firmenseite lesen mit getCourseGenerationJob.
 */
export async function getOperatorCourseGenerationJob(id: string): Promise<CourseGenerationJob | null> {
  const job = await getCourseGenerationJob(id);
  return job && !job.organizationId ? job : null;
}

export async function listCourseGenerationJobs(limit = 20): Promise<CourseGenerationJob[]> {
  return getDb()
    .select()
    .from(courseGenerationJobs)
    .where(isNull(courseGenerationJobs.organizationId))
    .orderBy(desc(courseGenerationJobs.createdAt))
    .limit(limit);
}

export async function updateCourseGenerationJob(
  id: string,
  values: Partial<typeof courseGenerationJobs.$inferInsert>,
): Promise<void> {
  // Ein abgebrochener Auftrag bleibt abgebrochen: setzt der noch laufende Worker danach einen anderen Status
  // („validating“, „importing“, „failed“ …), wird das ignoriert. Sonst würde ein Abbruch kurz vor Schluss überschrieben
  // und der Kurs trotzdem veröffentlicht. Nur Felder ohne Statuswechsel (Meldung, Kosten) gehen weiter durch.
  const keepCancelled = values.status !== undefined && values.status !== "cancelled";
  await getDb()
    .update(courseGenerationJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(keepCancelled ? and(eq(courseGenerationJobs.id, id), ne(courseGenerationJobs.status, "cancelled")) : eq(courseGenerationJobs.id, id));
}

/** Lebenszeichen eines laufenden Auftrags (nach jeder KI-Antwort), damit „hängt“ von „arbeitet langsam“ unterscheidbar ist. */
export async function touchCourseGenerationJob(id: string): Promise<void> {
  await getDb().update(courseGenerationJobs).set({ updatedAt: new Date() }).where(eq(courseGenerationJobs.id, id));
}

/** Nicht-terminale Status, in denen ein Worker arbeiten müsste. */
const RUNNING_STATUSES: CourseGenerationJobStatus[] = [
  "queued",
  "preflight",
  "blueprint_requested",
  "blueprint_generating",
  "blueprint_validating",
  "cost_estimating",
  "blueprint_ready",
  "canary_generating",
  "canary_validating",
  "content_generating",
  "batch_generating",
  "validating",
  "repairing",
  "importing",
];

/** Ab wann ein laufender Auftrag ohne Lebenszeichen als hängend gilt (eine KI-Anfrage samt Wiederholungen dauert höchstens etwa 12 Minuten). */
export const STALE_AFTER_MS = 15 * 60_000;
/** Wie oft ein verwaister Auftrag automatisch fortgesetzt wird, bevor er als unterbrochen endet (Schutz vor Absturzschleifen). */
export const MAX_AUTO_RESUMES = 2;
const AUTO_RESUME_PREFIX = "auto_resume:";

/** Letztes Lebenszeichen je Auftrag: der jüngere Zeitpunkt aus Auftrag und seinen Lernzielen. */
export async function lastActivityByJob(jobIds: string[]): Promise<Map<string, Date>> {
  if (jobIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ jobId: courseGenerationObjectives.jobId, last: max(courseGenerationObjectives.updatedAt) })
    .from(courseGenerationObjectives)
    .where(inArray(courseGenerationObjectives.jobId, jobIds))
    .groupBy(courseGenerationObjectives.jobId);
  return new Map(rows.filter((r) => r.last).map((r) => [r.jobId, r.last as Date]));
}

export type StaleJobAction = "resumed" | "interrupted";

/**
 * Findet laufende Aufträge, an denen in diesem Prozess niemand arbeitet und die seit STALE_AFTER_MS kein Lebenszeichen
 * gegeben haben - typischerweise nach einem Neustart des Servers (Deployment, Absturz): Der Worker läuft im
 * App-Prozess, der Auftrag stand danach für immer auf „läuft“. Solche Aufträge werden automatisch fortgesetzt (bereits
 * gültige Lernziele werden dabei nicht neu erzeugt, der Blueprint wird wiederverwendet), höchstens MAX_AUTO_RESUMES-mal;
 * danach enden sie als „failed“ mit errorCode "interrupted" und lassen sich von Hand erneut starten.
 * Die Übernahme ist ein bedingtes Update (gleicher Status, weiterhin ohne Lebenszeichen), damit nie zwei Worker denselben Auftrag
 * starten.
 */
export async function recoverStaleCourseGenerationJobs(
  isActive: (jobId: string) => boolean,
  start: (jobId: string) => void,
  now: Date = new Date(),
): Promise<Array<{ jobId: string; action: StaleJobAction }>> {
  const db = getDb();
  const threshold = new Date(now.getTime() - STALE_AFTER_MS);
  const candidates = await db
    .select()
    .from(courseGenerationJobs)
    .where(and(inArray(courseGenerationJobs.status, RUNNING_STATUSES), lt(courseGenerationJobs.updatedAt, threshold)));
  if (candidates.length === 0) return [];
  const activity = await lastActivityByJob(candidates.map((c) => c.id));
  const out: Array<{ jobId: string; action: StaleJobAction }> = [];
  for (const job of candidates) {
    if (isActive(job.id)) continue;
    // Ein wartender Teil eines aufgeteilten Kurses startet erst nach dem vorigen (nacheinander, nicht parallel).
    if (job.status === "queued" && job.splitOfJobId && (await earlierPartPending(job))) continue;
    const objectiveActivity = activity.get(job.id);
    if (objectiveActivity && objectiveActivity >= threshold) continue;
    const resumes = job.errorCode?.startsWith(AUTO_RESUME_PREFIX) ? Number(job.errorCode.slice(AUTO_RESUME_PREFIX.length)) || 0 : 0;
    // Bedingte Übernahme: nur, wenn der Auftrag noch im selben Status und weiterhin ohne Lebenszeichen ist. Setzt sie
    // updatedAt neu, scheitert jede zweite, gleichzeitige Übernahme an der Zeitbedingung.
    const claimWhere = and(
      eq(courseGenerationJobs.id, job.id),
      eq(courseGenerationJobs.status, job.status),
      lt(courseGenerationJobs.updatedAt, threshold),
    );
    if (resumes >= MAX_AUTO_RESUMES) {
      const claimed = await db
        .update(courseGenerationJobs)
        .set({
          status: "failed",
          errorCode: "interrupted",
          errorMessage: `Der Lauf wurde ${resumes + 1}-mal unterbrochen (z. B. Neustart des Servers) und nicht mehr automatisch fortgesetzt. „Erneut versuchen“ setzt beim nächsten offenen Lernziel fort.`,
          completedAt: now,
          updatedAt: now,
        })
        .where(claimWhere)
        .returning({ id: courseGenerationJobs.id });
      if (claimed.length > 0) out.push({ jobId: job.id, action: "interrupted" });
      continue;
    }
    const claimed = await db
      .update(courseGenerationJobs)
      .set({
        status: "queued",
        phase: "queued",
        errorCode: `${AUTO_RESUME_PREFIX}${resumes + 1}`,
        message: "Unterbrochener Lauf wird automatisch fortgesetzt (bereits fertige Lernziele bleiben erhalten) …",
        updatedAt: now,
      })
      .where(claimWhere)
      .returning({ id: courseGenerationJobs.id });
    if (claimed.length > 0) {
      start(job.id);
      out.push({ jobId: job.id, action: "resumed" });
    }
  }
  return out;
}

export async function markCourseGenerationJobFailed(
  id: string,
  errorCode: string,
  errorMessage: string,
  status: CourseGenerationJobStatus = "failed",
): Promise<void> {
  await updateCourseGenerationJob(id, {
    status,
    errorCode,
    errorMessage,
    completedAt: new Date(),
  });
}

export async function upsertCourseGenerationObjective(
  jobId: string,
  domainId: string,
  objectiveId: string,
  code: string,
  isCanary: boolean,
): Promise<CourseGenerationObjectiveRow> {
  const db = getDb();
  const existing = await db
    .select()
    .from(courseGenerationObjectives)
    .where(eq(courseGenerationObjectives.jobId, jobId));
  const found = existing.find((row) => row.objectiveId === objectiveId);
  if (found) return found;

  const [row] = await db
    .insert(courseGenerationObjectives)
    .values({ jobId, domainId, objectiveId, code, isCanary, status: "pending" })
    .returning();
  return row;
}

export async function updateCourseGenerationObjective(
  id: string,
  values: Partial<typeof courseGenerationObjectives.$inferInsert>,
): Promise<void> {
  await getDb()
    .update(courseGenerationObjectives)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(courseGenerationObjectives.id, id));
}

export async function listCourseGenerationObjectives(
  jobId: string,
): Promise<CourseGenerationObjectiveRow[]> {
  return getDb()
    .select()
    .from(courseGenerationObjectives)
    .where(eq(courseGenerationObjectives.jobId, jobId));
}

/**
 * Teile 2 ff. eines aufgeteilten sehr großen Kurses als eigene Aufträge anlegen (split.ts): gleiche Quellen und
 * Einstellungen, eigener Titel, fertiger Teil-Blueprint (der Worker verwendet ihn weiter, statt einen neuen zu erzeugen).
 * Sie bleiben „queued“; gestartet werden sie nacheinander nach dem vorigen Teil (runner.ts).
 */
export async function createSplitPartJobs(
  parent: CourseGenerationJob,
  parts: Array<{ title: string; blueprint: Record<string, unknown> }>,
  partCount: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, part] of parts.entries()) {
    const [row] = await getDb()
      .insert(courseGenerationJobs)
      .values({
        requestedByUserId: parent.requestedByUserId,
        courseTitle: part.title,
        courseDescription: parent.courseDescription,
        language: parent.language,
        provider: parent.provider,
        certificationVersion: parent.certificationVersion,
        courseType: parent.courseType,
        sourceUrls: parent.sourceUrls,
        categoryId: parent.categoryId,
        includeSectionQuizzes: parent.includeSectionQuizzes,
        includeFinalExam: parent.includeFinalExam,
        autoPublish: parent.autoPublish,
        initialCostLimitUsd: parent.initialCostLimitUsd,
        absoluteCostLimitUsd: parent.absoluteCostLimitUsd,
        blueprintProvider: parent.blueprintProvider,
        blueprintJson: part.blueprint,
        splitOfJobId: parent.id,
        splitPart: i + 2,
        splitParts: partCount,
        status: "queued",
        phase: "queued",
        message: `Teil ${i + 2} von ${partCount}: wartet auf den vorigen Teil …`,
      })
      .returning({ id: courseGenerationJobs.id });
    ids.push(row.id);
  }
  return ids;
}

/** Nächster wartender Teil eines aufgeteilten Kurses nach `jobId` (oder null). */
export async function nextSplitPartJob(jobId: string): Promise<string | null> {
  const job = await getCourseGenerationJob(jobId);
  if (!job) return null;
  const rootId = job.splitOfJobId ?? (job.splitParts ? job.id : null);
  if (!rootId) return null;
  const rows = await getDb()
    .select({ id: courseGenerationJobs.id, part: courseGenerationJobs.splitPart, status: courseGenerationJobs.status })
    .from(courseGenerationJobs)
    .where(eq(courseGenerationJobs.splitOfJobId, rootId));
  const next = rows.filter((r) => r.status === "queued" && (r.part ?? 0) > (job.splitPart ?? 1)).sort((a, b) => (a.part ?? 0) - (b.part ?? 0))[0];
  return next?.id ?? null;
}

async function earlierPartPending(job: CourseGenerationJob): Promise<boolean> {
  const rows = await getDb()
    .select({ id: courseGenerationJobs.id, part: courseGenerationJobs.splitPart, status: courseGenerationJobs.status, splitOfJobId: courseGenerationJobs.splitOfJobId })
    .from(courseGenerationJobs)
    .where(inArray(courseGenerationJobs.id, [job.splitOfJobId!]));
  const siblings = await getDb()
    .select({ part: courseGenerationJobs.splitPart, status: courseGenerationJobs.status })
    .from(courseGenerationJobs)
    .where(eq(courseGenerationJobs.splitOfJobId, job.splitOfJobId!));
  const earlier = [...rows.map((r) => ({ part: 1, status: r.status })), ...siblings].filter((r) => (r.part ?? 0) < (job.splitPart ?? 0));
  return earlier.some((r) => !isTerminalCourseGenerationStatus(r.status));
}
