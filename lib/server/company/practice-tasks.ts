import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  domains,
  objectives,
  practiceTaskSubmissions,
  practiceTasks,
  sections,
  users,
  type PracticeSubmissionStatus,
} from "@/lib/server/db/schema";
import { completedSectionIds } from "@/lib/server/sections/completed";
import { listAssignableLearningPaths } from "./assignments";

/**
 * Praxisaufgaben: Mentor oder Firmen-Admin legen zu einem Lernpfad der Firma eine praktische Aufgabe an; wem der
 * Lernpfad zugewiesen ist, gibt sie mit einer freiwilligen Notiz ab; eine ANDERE Person aus Mentor/Firmen-Admin
 * bestätigt oder schickt sie mit Hinweis zur Nacharbeit zurück. Die Bestätigung ist eine menschliche Entscheidung
 * (keine KI, keine Punkte, kein Vergleich); die Firma sieht je Zuweisung nur „x von y bestätigt“ (status.ts).
 * Jede Funktion bekommt `organizationId` aus der Mitgliedschaft und filtert immer danach.
 */

export const MAX_TASK_TITLE = 200;
export const MAX_TASK_DESCRIPTION = 2000;
export const MAX_NOTE = 1000;

export class InvalidTaskError extends Error {}
export class UnknownPathError extends Error {}
export class UnknownObjectiveError extends Error {}
export class UnknownSectionError extends Error {}
export class TaskNotFoundError extends Error {}
export class NotAssignedError extends Error {}
export class AlreadyConfirmedError extends Error {}
export class SelfReviewError extends Error {}
export class NotReviewableError extends Error {}
export class ReviewNoteRequiredError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function clean(text: string | null | undefined, max: number): string | null {
  // Steuerzeichen raus (Zeilenumbrüche bleiben), Ränder trimmen
  const value = (text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (value.length > max) throw new InvalidTaskError();
  return value || null;
}

export async function createPracticeTask(input: {
  organizationId: string;
  userId: string;
  certificationId: string;
  title: string;
  description?: string | null;
  /** Optional: Lernziel des Lernpfads, dessen Fragen die Aufgabe prüft. */
  objectiveId?: string | null;
  /** Optional: Lektion des Lernpfads, nach deren Abschluss die Aufgabe erscheint. */
  unlockSectionId?: string | null;
}): Promise<{ id: string }> {
  const title = clean(input.title, MAX_TASK_TITLE);
  if (!title || title.length < 3) throw new InvalidTaskError();
  const description = clean(input.description, MAX_TASK_DESCRIPTION);
  // Nur zu Lernpfaden, die die Firma auch zuweisen darf (freigegeben und für sie freigeschaltet).
  const paths = await listAssignableLearningPaths(input.organizationId);
  if (!paths.some((p) => p.id === input.certificationId)) throw new UnknownPathError();

  let objectiveId: string | null = null;
  if (input.objectiveId) {
    const [objective] = await getDb()
      .select({ id: objectives.id })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(objectives.id, input.objectiveId), eq(domains.certificationId, input.certificationId)))
      .limit(1);
    if (!objective) throw new UnknownObjectiveError();
    objectiveId = objective.id;
  }

  let unlockSectionId: string | null = null;
  if (input.unlockSectionId) {
    const [section] = await getDb()
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(sections.id, input.unlockSectionId), eq(domains.certificationId, input.certificationId)))
      .limit(1);
    if (!section) throw new UnknownSectionError();
    unlockSectionId = section.id;
  }

  const [row] = await getDb()
    .insert(practiceTasks)
    .values({ organizationId: input.organizationId, certificationId: input.certificationId, title, description, objectiveId, unlockSectionId, createdByUserId: input.userId })
    .returning({ id: practiceTasks.id });
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "practice_task.created",
    targetType: "practice_task",
    targetId: row.id,
    metadata: { organizationId: input.organizationId },
  }).catch(logAuditFailure);
  return row;
}

/** Archiviert eine Aufgabe der eigenen Firma (sie zählt nicht mehr, Abgaben bleiben erhalten). false = nicht gefunden. */
export async function archivePracticeTask(organizationId: string, taskId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .update(practiceTasks)
    .set({ archivedAt: new Date() })
    .where(and(eq(practiceTasks.id, taskId), eq(practiceTasks.organizationId, organizationId), isNull(practiceTasks.archivedAt)))
    .returning({ id: practiceTasks.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId: userId,
    action: "practice_task.archived",
    targetType: "practice_task",
    targetId: taskId,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}

export type ManageTaskView = {
  id: string;
  title: string;
  description: string | null;
  learningPath: string;
  assignees: number;
  submitted: number;
  confirmed: number;
  rework: number;
  createdAt: Date;
};

export type PendingSubmissionView = {
  id: string;
  taskTitle: string;
  learningPath: string;
  memberName: string | null;
  memberEmail: string;
  note: string | null;
  submittedAt: Date;
};

/** Verwaltungsansicht (Mentor, Firmen-Admin): Aufgaben mit Zählern und die Abgaben, die auf Bestätigung warten. */
export async function listPracticeTasksForOrg(organizationId: string): Promise<{ tasks: ManageTaskView[]; pending: PendingSubmissionView[] }> {
  const db = getDb();
  const tasks = await db
    .select({
      id: practiceTasks.id,
      title: practiceTasks.title,
      description: practiceTasks.description,
      learningPath: certifications.name,
      createdAt: practiceTasks.createdAt,
      assignees: sql<number>`(select count(*)::int from ${companyAssignments} a where a.organization_id = ${practiceTasks.organizationId} and a.certification_id = ${practiceTasks.certificationId})`,
      submitted: sql<number>`(select count(*)::int from ${practiceTaskSubmissions} s where s.task_id = ${practiceTasks.id} and s.status = 'submitted')`,
      confirmed: sql<number>`(select count(*)::int from ${practiceTaskSubmissions} s where s.task_id = ${practiceTasks.id} and s.status = 'confirmed')`,
      rework: sql<number>`(select count(*)::int from ${practiceTaskSubmissions} s where s.task_id = ${practiceTasks.id} and s.status = 'rework')`,
    })
    .from(practiceTasks)
    .innerJoin(certifications, eq(certifications.id, practiceTasks.certificationId))
    .where(and(eq(practiceTasks.organizationId, organizationId), isNull(practiceTasks.archivedAt)))
    .orderBy(desc(practiceTasks.createdAt));
  const pending = await db
    .select({
      id: practiceTaskSubmissions.id,
      taskTitle: practiceTasks.title,
      learningPath: certifications.name,
      memberName: users.name,
      memberEmail: users.email,
      note: practiceTaskSubmissions.learnerNote,
      submittedAt: practiceTaskSubmissions.submittedAt,
    })
    .from(practiceTaskSubmissions)
    .innerJoin(practiceTasks, eq(practiceTasks.id, practiceTaskSubmissions.taskId))
    .innerJoin(certifications, eq(certifications.id, practiceTasks.certificationId))
    .innerJoin(users, eq(users.id, practiceTaskSubmissions.userId))
    .where(
      and(
        eq(practiceTaskSubmissions.organizationId, organizationId),
        eq(practiceTaskSubmissions.status, "submitted"),
        isNull(practiceTasks.archivedAt),
      ),
    )
    .orderBy(asc(practiceTaskSubmissions.submittedAt));
  return { tasks, pending };
}

export type MyTaskView = {
  taskId: string;
  title: string;
  description: string | null;
  learningPath: string;
  slug: string;
  certificationId: string;
  status: PracticeSubmissionStatus | "open";
  note: string | null;
  reviewerNote: string | null;
};

/** Eigene Sicht: Aufgaben zu den Lernpfaden, die mir zugewiesen sind, mit meinem Stand. Nie die Abgaben anderer. */
export async function listMyPracticeTasks(organizationId: string, userId: string): Promise<MyTaskView[]> {
  const rows = await getDb()
    .select({
      taskId: practiceTasks.id,
      title: practiceTasks.title,
      description: practiceTasks.description,
      learningPath: certifications.name,
      slug: certifications.slug,
      certificationId: practiceTasks.certificationId,
      unlockSectionId: practiceTasks.unlockSectionId,
      status: practiceTaskSubmissions.status,
      note: practiceTaskSubmissions.learnerNote,
      reviewerNote: practiceTaskSubmissions.reviewerNote,
    })
    .from(practiceTasks)
    .innerJoin(
      companyAssignments,
      and(
        eq(companyAssignments.organizationId, practiceTasks.organizationId),
        eq(companyAssignments.certificationId, practiceTasks.certificationId),
        eq(companyAssignments.userId, userId),
      ),
    )
    .innerJoin(certifications, eq(certifications.id, practiceTasks.certificationId))
    .leftJoin(practiceTaskSubmissions, and(eq(practiceTaskSubmissions.taskId, practiceTasks.id), eq(practiceTaskSubmissions.userId, userId)))
    .where(and(eq(practiceTasks.organizationId, organizationId), isNull(practiceTasks.archivedAt)))
    .orderBy(asc(certifications.name), asc(practiceTasks.createdAt));
  // Aufgaben mit Freischaltung erscheinen erst, wenn die Lektion abgeschlossen ist (oder schon eine Abgabe existiert).
  const gated = rows.flatMap((r) => (r.unlockSectionId ? [r.unlockSectionId] : []));
  const done = await completedSectionIds(userId, [...new Set(gated)]);
  return rows
    .filter((r) => !r.unlockSectionId || done.has(r.unlockSectionId) || r.status !== null)
    .map(({ unlockSectionId: _unlock, ...r }) => ({ ...r, status: r.status ?? ("open" as const) }));
}

/**
 * Abgabe (oder erneute Abgabe nach Nacharbeit). Nur für Personen, denen der Lernpfad zugewiesen ist. Bestätigtes
 * bleibt bestätigt (AlreadyConfirmedError). Eine erneute Abgabe löscht den alten Prüfhinweis.
 */
export async function submitPracticeTask(input: { organizationId: string; userId: string; taskId: string; note?: string | null }): Promise<void> {
  const note = clean(input.note, MAX_NOTE);
  await getDb().transaction(async (tx) => {
    const [task] = await tx
      .select({ id: practiceTasks.id, certificationId: practiceTasks.certificationId, unlockSectionId: practiceTasks.unlockSectionId })
      .from(practiceTasks)
      .where(and(eq(practiceTasks.id, input.taskId), eq(practiceTasks.organizationId, input.organizationId), isNull(practiceTasks.archivedAt)))
      .limit(1);
    if (!task) throw new TaskNotFoundError();
    const [assignment] = await tx
      .select({ id: companyAssignments.id })
      .from(companyAssignments)
      .where(
        and(
          eq(companyAssignments.organizationId, input.organizationId),
          eq(companyAssignments.userId, input.userId),
          eq(companyAssignments.certificationId, task.certificationId),
        ),
      )
      .limit(1);
    // Wer den Lernpfad nicht hat, erfährt nichts über die Aufgabe.
    if (!assignment) throw new TaskNotFoundError();
    // Noch nicht freigeschaltet: wie nicht vorhanden (Abgaben, die vor einer späteren Verknüpfung entstanden, bleiben möglich).
    if (task.unlockSectionId && !(await completedSectionIds(input.userId, [task.unlockSectionId])).has(task.unlockSectionId)) {
      const [prior] = await tx
        .select({ id: practiceTaskSubmissions.id })
        .from(practiceTaskSubmissions)
        .where(and(eq(practiceTaskSubmissions.taskId, task.id), eq(practiceTaskSubmissions.userId, input.userId)))
        .limit(1);
      if (!prior) throw new TaskNotFoundError();
    }

    const [existing] = await tx
      .select({ id: practiceTaskSubmissions.id, status: practiceTaskSubmissions.status })
      .from(practiceTaskSubmissions)
      .where(and(eq(practiceTaskSubmissions.taskId, task.id), eq(practiceTaskSubmissions.userId, input.userId)))
      .for("update")
      .limit(1);
    if (existing?.status === "confirmed") throw new AlreadyConfirmedError();
    const fresh = { status: "submitted" as const, learnerNote: note, submittedAt: new Date(), reviewedByUserId: null, reviewedAt: null, reviewerNote: null, learnedAt: null };
    if (existing) {
      await tx.update(practiceTaskSubmissions).set(fresh).where(eq(practiceTaskSubmissions.id, existing.id));
    } else {
      await tx.insert(practiceTaskSubmissions).values({ taskId: task.id, organizationId: input.organizationId, userId: input.userId, ...fresh });
    }
  });
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "practice_task.submitted",
    targetType: "practice_task",
    targetId: input.taskId,
    metadata: { organizationId: input.organizationId },
  }).catch(logAuditFailure);
}

/**
 * Bestätigung oder Nacharbeit durch eine andere Person aus Mentor/Firmen-Admin (die Rolle prüft die Route). Nur
 * abgegebene Arbeiten sind prüfbar; bestätigt ist endgültig; Nacharbeit braucht einen Hinweis. null = nicht gefunden.
 */
export async function reviewPracticeSubmission(input: {
  organizationId: string;
  reviewerId: string;
  submissionId: string;
  decision: "confirm" | "rework";
  note?: string | null;
}): Promise<boolean> {
  const note = clean(input.note, MAX_NOTE);
  if (input.decision === "rework" && (note?.length ?? 0) < 3) throw new ReviewNoteRequiredError();
  const found = await getDb().transaction(async (tx) => {
    const [sub] = await tx
      .select({ id: practiceTaskSubmissions.id, userId: practiceTaskSubmissions.userId, status: practiceTaskSubmissions.status })
      .from(practiceTaskSubmissions)
      .innerJoin(practiceTasks, eq(practiceTasks.id, practiceTaskSubmissions.taskId))
      .where(
        and(
          eq(practiceTaskSubmissions.id, input.submissionId),
          eq(practiceTaskSubmissions.organizationId, input.organizationId),
          isNull(practiceTasks.archivedAt),
        ),
      )
      .for("update", { of: practiceTaskSubmissions })
      .limit(1);
    if (!sub) return false;
    if (sub.userId === input.reviewerId) throw new SelfReviewError();
    if (sub.status !== "submitted") throw new NotReviewableError();
    await tx
      .update(practiceTaskSubmissions)
      .set({
        status: input.decision === "confirm" ? "confirmed" : "rework",
        reviewedByUserId: input.reviewerId,
        reviewedAt: new Date(),
        reviewerNote: note,
      })
      .where(eq(practiceTaskSubmissions.id, sub.id));
    return true;
  });
  if (found) {
    await recordAuditEvent({
      actorUserId: input.reviewerId,
      action: input.decision === "confirm" ? "practice_task.confirmed" : "practice_task.rework_requested",
      targetType: "practice_task_submission",
      targetId: input.submissionId,
      metadata: { organizationId: input.organizationId },
    }).catch(logAuditFailure);
  }
  return found;
}

/**
 * Praxisaufgaben, die diese Lektion freischaltet, für eine Person der Firma mit dem Lernpfad: nur wenn die Lektion
 * abgeschlossen ist. Für den Hinweis „Praxisaufgabe freigeschaltet“ (und als Bezug in „Warum lerne ich das?“).
 */
export async function listTasksUnlockedBySection(organizationId: string, userId: string, sectionId: string): Promise<Array<{ taskId: string; title: string; unlocked: boolean }>> {
  const rows = await getDb()
    .select({ taskId: practiceTasks.id, title: practiceTasks.title })
    .from(practiceTasks)
    .innerJoin(
      companyAssignments,
      and(
        eq(companyAssignments.organizationId, practiceTasks.organizationId),
        eq(companyAssignments.certificationId, practiceTasks.certificationId),
        eq(companyAssignments.userId, userId),
      ),
    )
    .where(and(eq(practiceTasks.organizationId, organizationId), eq(practiceTasks.unlockSectionId, sectionId), isNull(practiceTasks.archivedAt)))
    .orderBy(asc(practiceTasks.createdAt));
  if (rows.length === 0) return [];
  const unlocked = (await completedSectionIds(userId, [sectionId])).has(sectionId);
  return rows.map((r) => ({ ...r, unlocked }));
}

/** Lektionen je Lernpfad für die Freischaltung einer Aufgabe (nur Kursstruktur). */
export async function listSectionsForPaths(certificationIds: string[]): Promise<Record<string, Array<{ id: string; code: string; title: string }>>> {
  if (certificationIds.length === 0) return {};
  const rows = await getDb()
    .select({ certificationId: domains.certificationId, id: sections.id, code: objectives.code, title: sections.title })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(inArray(domains.certificationId, certificationIds))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum));
  const out: Record<string, Array<{ id: string; code: string; title: string }>> = {};
  for (const r of rows) (out[r.certificationId] ??= []).push({ id: r.id, code: r.code, title: r.title.de });
  return out;
}

/** Lernziele je Lernpfad für die Auswahl bei der Aufgabe (nur Kursstruktur, keine Lerndaten). */
export async function listObjectivesForPaths(certificationIds: string[]): Promise<Record<string, Array<{ id: string; code: string; title: string }>>> {
  if (certificationIds.length === 0) return {};
  const rows = await getDb()
    .select({ certificationId: domains.certificationId, id: objectives.id, code: objectives.code, title: objectives.title })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(inArray(domains.certificationId, certificationIds))
    .orderBy(asc(domains.orderNum), asc(objectives.code));
  const out: Record<string, Array<{ id: string; code: string; title: string }>> = {};
  for (const r of rows) (out[r.certificationId] ??= []).push({ id: r.id, code: r.code, title: r.title });
  return out;
}
