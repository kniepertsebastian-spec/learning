import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  domains,
  objectiveProgress,
  objectives,
  organizations,
  type AssignmentStatus,
} from "@/lib/server/db/schema";

/**
 * Lernende Seite der Firmenzuweisungen. Dieses Modul darf Lerndaten LESEN (der Firmenbereich nicht) und
 * schreibt als einziges Ergebnis den Status in company_assignments. So bleibt die Firma bei Status,
 * Datum und Frist, während der Fortschritt automatisch nachgezogen wird.
 *
 * Regeln (regelbasiert, keine KI):
 *  - in_progress: sobald es für diesen Lernpfad Fortschritt gibt (mindestens ein Lernziel geübt).
 *  - completed: JEDES Lernziel des Lernpfads gilt als beherrscht (objective_progress.status = STRONG,
 *    das heißt mindestens 3 Antworten und gewichtete Quote ab 80 %). „Bestanden heißt beherrscht.“
 *  - Es geht nur vorwärts: abgeschlossen bleibt abgeschlossen, auch wenn die Quote später sinkt.
 *  - Es wird nur bei Lernereignissen aktualisiert, nicht beim Zuweisen. Wer schon alles beherrscht,
 *    gilt deshalb erst beim nächsten Lernereignis als abgeschlossen.
 */

/** Zieht den Status der offenen Zuweisungen des Nutzers für diesen Lernpfad nach. */
export async function syncAssignmentStatus(userId: string, certificationId: string, now: Date = new Date()): Promise<void> {
  const db = getDb();
  const open = await db
    .select({ id: companyAssignments.id, status: companyAssignments.status })
    .from(companyAssignments)
    .where(
      and(
        eq(companyAssignments.userId, userId),
        eq(companyAssignments.certificationId, certificationId),
        ne(companyAssignments.status, "completed"),
      ),
    );
  if (open.length === 0) return; // der Normalfall: keine Zuweisung, kein weiterer Aufwand

  const [[totalRow], [progressRow]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certificationId)),
    db
      .select({
        practiced: sql<number>`count(*)::int`,
        mastered: sql<number>`count(*) filter (where ${objectiveProgress.status} = 'STRONG')::int`,
      })
      .from(objectiveProgress)
      .innerJoin(objectives, eq(objectives.id, objectiveProgress.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(objectiveProgress.userId, userId), eq(domains.certificationId, certificationId))),
  ]);

  const total = totalRow?.count ?? 0;
  const practiced = progressRow?.practiced ?? 0;
  const mastered = progressRow?.mastered ?? 0;

  let next: AssignmentStatus | null = null;
  if (total > 0 && mastered >= total) next = "completed";
  else if (practiced > 0) next = "in_progress";
  if (!next) return;

  const ids = open.filter((a) => a.status !== next).map((a) => a.id);
  if (ids.length === 0) return;
  await db
    .update(companyAssignments)
    .set(next === "completed" ? { status: next, completedAt: now } : { status: next })
    .where(and(inArray(companyAssignments.id, ids), ne(companyAssignments.status, "completed")));
}

/** Für den Fortschritts-Schreibweg: ermittelt den Lernpfad des Lernziels und zieht die Zuweisungen nach. */
export async function syncAssignmentsForObjective(userId: string, objectiveId: string): Promise<void> {
  const [row] = await getDb()
    .select({ certificationId: domains.certificationId })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (row) await syncAssignmentStatus(userId, row.certificationId);
}

export type MyAssignment = {
  id: string;
  learningPath: string;
  slug: string;
  organizationName: string;
  status: AssignmentStatus;
  assignedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
};

/** Die eigenen Zuweisungen des Nutzers: was die Firma ihm aufgetragen hat (Transparenz für den Lernenden). */
export async function listMyAssignments(userId: string): Promise<MyAssignment[]> {
  return getDb()
    .select({
      id: companyAssignments.id,
      learningPath: certifications.name,
      slug: certifications.slug,
      organizationName: organizations.name,
      status: companyAssignments.status,
      assignedAt: companyAssignments.assignedAt,
      dueAt: companyAssignments.dueAt,
      completedAt: companyAssignments.completedAt,
    })
    .from(companyAssignments)
    .innerJoin(certifications, eq(certifications.id, companyAssignments.certificationId))
    .innerJoin(organizations, eq(organizations.id, companyAssignments.organizationId))
    .where(eq(companyAssignments.userId, userId))
    .orderBy(asc(companyAssignments.dueAt), asc(companyAssignments.assignedAt));
}
