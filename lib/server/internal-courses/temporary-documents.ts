import { and, eq, exists, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { companyDocuments, courseGenerationJobDocuments, courseGenerationJobs } from "@/lib/server/db/schema";

/** Nach Erfolg oder Abbruch sind die Dateien nicht mehr nötig. Bei einem Fehler bleiben sie für „Erneut versuchen“ erhalten. */
const DONE_STATUSES = ["package_ready", "published", "cancelled"];
/** Spätestens nach dieser Zeit verschwindet jede temporäre Datei, auch nach einem Fehler. */
export const TEMPORARY_DOCUMENT_MAX_AGE_HOURS = 24;

/** Löscht die temporären Dateien eines Auftrags (gespeicherte Dokumente unter „Dokumente“ bleiben unberührt). */
export async function cleanupJobDocuments(jobId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: courseGenerationJobDocuments.documentId })
    .from(courseGenerationJobDocuments)
    .innerJoin(companyDocuments, eq(companyDocuments.id, courseGenerationJobDocuments.documentId))
    .where(and(eq(courseGenerationJobDocuments.jobId, jobId), eq(companyDocuments.temporary, true)));
  if (rows.length === 0) return 0;
  await getDb().delete(companyDocuments).where(and(inArray(companyDocuments.id, rows.map((r) => r.id)), eq(companyDocuments.temporary, true)));
  return rows.length;
}

/** Löscht die Dateien eines Auftrags nur, wenn er erfolgreich oder abgebrochen beendet ist. */
export async function cleanupJobDocumentsIfDone(jobId: string): Promise<void> {
  const [job] = await getDb().select({ status: courseGenerationJobs.status }).from(courseGenerationJobs).where(eq(courseGenerationJobs.id, jobId)).limit(1);
  if (job && DONE_STATUSES.includes(job.status)) await cleanupJobDocuments(jobId);
}

/**
 * Räumt verwaiste temporäre Dateien auf (Neustart mitten im Lauf, Fehler, abgebrochener Upload): zu alt, Auftrag beendet
 * (außer Fehler < 24 h), oder nie einem Auftrag zugeordnet (> 1 h).
 */
export async function purgeOrphanTemporaryDocuments(now = new Date()): Promise<number> {
  const db = getDb();
  const dayAgo = new Date(now.getTime() - TEMPORARY_DOCUMENT_MAX_AGE_HOURS * 3600_000);
  const hourAgo = new Date(now.getTime() - 3600_000);
  const linked = (cond: ReturnType<typeof sql>) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(courseGenerationJobDocuments)
        .innerJoin(courseGenerationJobs, eq(courseGenerationJobs.id, courseGenerationJobDocuments.jobId))
        .where(and(eq(courseGenerationJobDocuments.documentId, companyDocuments.id), cond)),
    );
  const unlinked = sql`not exists (select 1 from ${courseGenerationJobDocuments} where ${courseGenerationJobDocuments.documentId} = ${companyDocuments.id})`;
  const doneJob = sql`${courseGenerationJobs.status} in (${sql.join(DONE_STATUSES.map((s) => sql`${s}`), sql`, `)})`;
  const deleted = await db
    .delete(companyDocuments)
    .where(
      and(
        eq(companyDocuments.temporary, true),
        or(lt(companyDocuments.createdAt, dayAgo), and(unlinked, lt(companyDocuments.createdAt, hourAgo)), linked(doneJob)),
      ),
    )
    .returning({ id: companyDocuments.id });
  return deleted.length;
}
