import { and, asc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  domains,
  lessonCompletions,
  objectiveProgress,
  objectives,
  organizations,
  sections,
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
 *  - Lernpfade OHNE Lektionstests (nur interne, „reine Absolvierung zum Verständnis“): completed, sobald jede Lektion
 *    als durchgearbeitet markiert ist; in_progress, sobald eine markiert ist. Die Abschlussprüfung (falls vorhanden)
 *    ist dort wie sonst eine freiwillige Selbstkontrolle und kein Abschlusskriterium (es gibt keine Bestehensgrenze).
 *  - Es geht nur vorwärts: abgeschlossen bleibt abgeschlossen, auch wenn die Quote später sinkt.
 *  - Neue Runde (Pflicht mit Wiederholung, `round` > 1): Es zählt nur, was nach Beginn der Runde nachgewiesen wurde,
 *    also Lektionen, die erneut als durchgearbeitet markiert wurden, bzw. Lernziele, die erneut geübt wurden und
 *    weiterhin als beherrscht gelten. Der Fortschritt aus früheren Runden bleibt erhalten, zählt aber nicht mehr.
 *  - Es wird nur bei Lernereignissen aktualisiert, nicht beim Zuweisen. Wer schon alles beherrscht,
 *    gilt deshalb erst beim nächsten Lernereignis als abgeschlossen.
 */

/** Zieht den Status der offenen Zuweisungen des Nutzers für diesen Lernpfad nach. */
export async function syncAssignmentStatus(userId: string, certificationId: string, now: Date = new Date()): Promise<void> {
  const db = getDb();
  const open = await db
    .select({ id: companyAssignments.id, status: companyAssignments.status, round: companyAssignments.round, roundStartedAt: companyAssignments.roundStartedAt })
    .from(companyAssignments)
    .where(
      and(
        eq(companyAssignments.userId, userId),
        eq(companyAssignments.certificationId, certificationId),
        ne(companyAssignments.status, "completed"),
      ),
    );
  if (open.length === 0) return; // der Normalfall: keine Zuweisung, kein weiterer Aufwand
  // Nur ab der zweiten Runde zählt der Beginn der Runde als Untergrenze für Nachweise.
  const since = open.find((a) => a.round > 1)?.roundStartedAt ?? null;

  const [features] = await db
    .select({ quizzes: certifications.includeSectionQuizzes })
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (features && !features.quizzes) {
    await syncByLessons(userId, certificationId, open, now, since);
    return;
  }

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
      .where(
        and(
          eq(objectiveProgress.userId, userId),
          eq(domains.certificationId, certificationId),
          ...(since ? [gte(objectiveProgress.lastAttemptAt, since)] : []),
        ),
      ),
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

/** Abschluss durch Durcharbeiten: alle Lektionen des Lernpfads sind als erledigt markiert. */
async function syncByLessons(
  userId: string,
  certificationId: string,
  open: { id: string; status: AssignmentStatus }[],
  now: Date,
  since: Date | null,
): Promise<void> {
  const db = getDb();
  const [[totalRow], [doneRow]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certificationId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonCompletions)
      .innerJoin(sections, eq(sections.id, lessonCompletions.sectionId))
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(
        and(
          eq(lessonCompletions.userId, userId),
          eq(domains.certificationId, certificationId),
          ...(since ? [gte(lessonCompletions.completedAt, since)] : []),
        ),
      ),
  ]);
  const total = totalRow?.count ?? 0;
  const done = doneRow?.count ?? 0;
  const next: AssignmentStatus | null = total > 0 && done >= total ? "completed" : done > 0 ? "in_progress" : null;
  if (!next) return;
  const ids = open.filter((a) => a.status !== next).map((a) => a.id);
  if (ids.length === 0) return;
  await db
    .update(companyAssignments)
    .set(next === "completed" ? { status: next, completedAt: now } : { status: next })
    .where(and(inArray(companyAssignments.id, ids), ne(companyAssignments.status, "completed")));
}

/** Für den Lektions-Schreibweg: ermittelt den Lernpfad der Lektion und zieht die Zuweisungen nach. */
export async function syncAssignmentsForSection(userId: string, sectionId: string): Promise<void> {
  const [row] = await getDb()
    .select({ certificationId: domains.certificationId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (row) await syncAssignmentStatus(userId, row.certificationId);
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
