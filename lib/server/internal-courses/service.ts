import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { createCourseGenerationJob, DuplicateCourseGenerationJobError, getCourseGenerationJob, updateCourseGenerationJob } from "@/lib/server/course-generation/job-service";
import { startCourseGenerationJob } from "@/lib/server/course-generation/runner";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyDocuments,
  courseGenerationJobDocuments,
  courseGenerationJobs,
  TERMINAL_COURSE_GENERATION_JOB_STATUSES,
} from "@/lib/server/db/schema";
import { AiAccessUnavailableError, clientForOrganization } from "./ai-client";
import { purgeOrphanTemporaryDocuments } from "./temporary-documents";

/**
 * Interne Lernpfade einer Firma: Firmendokument → KI-Entwurf → Prüfung durch Mentor oder Firmen-Admin der Firma →
 * Freigabe. Alles gehört der Firma (Organisation kommt immer aus der Mitgliedschaft, nie aus der Anfrage); der
 * Betreiber sieht weder die Aufträge noch die Lernpfade.
 */

/** Kostenbremse je Auftrag, auch beim eigenen Schlüssel (schützt das Konto der Firma): Ziel und hartes Limit in USD. */
export const INTERNAL_INITIAL_COST_LIMIT_USD = 1;
export const INTERNAL_ABSOLUTE_COST_LIMIT_USD = 3;
/** Gleichzeitig laufende Aufträge je Firma. */
export const MAX_ACTIVE_JOBS_PER_ORGANIZATION = 2;

/** Höchstzahl Dateien je Kurs (z. B. eine ganze Umgebung mit 30 Konfigurations- und Skriptdateien). */
export const MAX_FILES_PER_COURSE = 50;

export class DocumentUnavailableError extends Error {}
export class TooManyActiveJobsError extends Error {}
export { AiAccessUnavailableError, DuplicateCourseGenerationJobError };

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/** Steuerzeichen raus, Leerraum glätten, auf 120 Zeichen kürzen. */
export function cleanCourseTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function startInternalCourse(input: {
  organizationId: string;
  userId: string;
  /** Eine oder mehrere Dateien (temporär hochgeladen oder gespeicherte Dokumente). */
  documentId?: string;
  documentIds?: string[];
  title: string;
  language: "de" | "en";
  /** Mit Lektionstests / Abschlussprüfung (Standard ja). Beides aus: reiner Durchlauf der Lektionen, keine KI-Fragen. */
  includeSectionQuizzes?: boolean;
  includeFinalExam?: boolean;
  /** Nur für Tests: legt den Auftrag an, startet aber den Worker nicht. */
  startWorker?: boolean;
}): Promise<{ jobId: string }> {
  const title = cleanCourseTitle(input.title);
  await purgeOrphanTemporaryDocuments().catch((e) => console.error("Aufräumen temporärer Dateien fehlgeschlagen:", e));
  const documentIds = [...new Set(input.documentIds ?? (input.documentId ? [input.documentId] : []))];
  if (documentIds.length === 0) throw new DocumentUnavailableError("Bitte mindestens eine Datei angeben.");
  if (documentIds.length > MAX_FILES_PER_COURSE) throw new DocumentUnavailableError(`Höchstens ${MAX_FILES_PER_COURSE} Dateien je Kurs.`);
  const docs = await getDb()
    .select({ id: companyDocuments.id, excludeFromAi: companyDocuments.excludeFromAi })
    .from(companyDocuments)
    .where(and(inArray(companyDocuments.id, documentIds), eq(companyDocuments.organizationId, input.organizationId)));
  if (docs.length !== documentIds.length) throw new DocumentUnavailableError("Eine der Dateien gibt es nicht.");
  if (docs.some((d) => d.excludeFromAi)) throw new DocumentUnavailableError("Eine der Dateien ist von der KI-Verarbeitung ausgeschlossen.");

  // Früh und verständlich scheitern, wenn die Firma keinen nutzbaren KI-Zugang hat (der Worker prüft es erneut).
  await clientForOrganization(input.organizationId);

  const [{ active }] = await getDb()
    .select({ active: sql<number>`count(*)::int` })
    .from(courseGenerationJobs)
    .where(
      and(
        eq(courseGenerationJobs.organizationId, input.organizationId),
        notInArray(courseGenerationJobs.status, TERMINAL_COURSE_GENERATION_JOB_STATUSES),
      ),
    );
  if (active >= MAX_ACTIVE_JOBS_PER_ORGANIZATION) throw new TooManyActiveJobsError();

  const job = await createCourseGenerationJob({
    requestedByUserId: input.userId,
    organizationId: input.organizationId,
    documentId: documentIds[0],
    includeSectionQuizzes: input.includeSectionQuizzes ?? true,
    includeFinalExam: input.includeFinalExam ?? true,
    courseTitle: title,
    courseDescription: `Interner Lernpfad aus dem Firmendokument „${title}“`,
    language: input.language,
    provider: "Intern",
    sourceUrls: [],
    // Der Entwurf wird angelegt, ist aber erst nach der Freigabe durch die Firma für Lernende sichtbar.
    autoPublish: true,
    initialCostLimitUsd: INTERNAL_INITIAL_COST_LIMIT_USD,
    absoluteCostLimitUsd: INTERNAL_ABSOLUTE_COST_LIMIT_USD,
    blueprintProvider: "anthropic-sonnet",
  });
  await getDb().insert(courseGenerationJobDocuments).values(documentIds.map((documentId, orderNum) => ({ jobId: job.id, documentId, orderNum })));
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "internal_course.started",
    targetType: "organization",
    targetId: input.organizationId,
    // Nur IDs, nie Titel oder Inhalt des Dokuments.
    metadata: { jobId: job.id, documentId: documentIds[0], fileCount: documentIds.length },
  }).catch(logAuditFailure);
  if (input.startWorker !== false) startCourseGenerationJob(job.id);
  return { jobId: job.id };
}

/** Bricht einen laufenden Auftrag der EIGENEN Firma ab. false = nicht gefunden oder schon beendet. */
export async function cancelInternalCourseJob(organizationId: string, jobId: string): Promise<boolean> {
  const job = await getCourseGenerationJob(jobId);
  if (!job || job.organizationId !== organizationId) return false;
  if ((TERMINAL_COURSE_GENERATION_JOB_STATUSES as string[]).includes(job.status)) return false;
  await updateCourseGenerationJob(jobId, { status: "cancelled", message: "Auftrag wurde abgebrochen.", completedAt: new Date() });
  return true;
}

/**
 * Freigabe durch die Firma: Mentor oder Firmen-Admin hat den KI-Entwurf geprüft. Name und Datum werden am Lernpfad
 * gespeichert. Erst danach ist er für Lernende sichtbar und zuweisbar. false = nicht gefunden (auch für fremde
 * Firmen) oder schon freigegeben.
 */
export async function approveInternalCourse(
  organizationId: string,
  certificationId: string,
  reviewer: { id: string; name: string },
): Promise<boolean> {
  const [row] = await getDb()
    .update(certifications)
    .set({ catalogStatus: "approved", approvedByName: reviewer.name, approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(certifications.id, certificationId),
        eq(certifications.kind, "internal"),
        eq(certifications.ownerOrganizationId, organizationId),
        inArray(certifications.catalogStatus, ["draft", "in_review"]),
      ),
    )
    .returning({ id: certifications.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId: reviewer.id,
    action: "internal_course.approved",
    targetType: "certification",
    targetId: certificationId,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}

/** Verwirft einen noch nicht freigegebenen Entwurf der eigenen Firma. Freigegebene Lernpfade bleiben (Zuweisungen!). */
export async function discardInternalCourseDraft(organizationId: string, certificationId: string, actorUserId: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(certifications)
    .where(
      and(
        eq(certifications.id, certificationId),
        eq(certifications.kind, "internal"),
        eq(certifications.ownerOrganizationId, organizationId),
        inArray(certifications.catalogStatus, ["draft", "in_review"]),
      ),
    )
    .returning({ id: certifications.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId,
    action: "internal_course.discarded",
    targetType: "certification",
    targetId: certificationId,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}
