import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
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
      certificationVersion: input.certificationVersion,
      sourceUrls: input.sourceUrls,
      organizationId: input.organizationId,
      documentId: input.documentId,
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
  await getDb()
    .update(courseGenerationJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(courseGenerationJobs.id, id));
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
