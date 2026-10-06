import { and, asc, eq, inArray, ne, or, type SQL } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  companyCourseEntitlements,
  organizationMemberships,
  users,
  type CompanyRole,
  type CourseKind,
} from "@/lib/server/db/schema";

/**
 * Lernpfade (derzeit Zertifizierungen) an Mitglieder der EIGENEN Organisation zuweisen. Jede Funktion
 * bekommt `organizationId` aus der Mitgliedschaft (guard.ts) und filtert immer danach: eine fremde
 * Zuweisung oder ein Mitglied einer anderen Firma ist hier nicht auffindbar. Hier wird nur geschrieben,
 * was in company_assignments steht (Status, Daten) - nie Lerndaten.
 */

/** Höchstzahl Personen je Zuweisung (verhindert absurde Massenaktionen). */
export const MAX_ASSIGNEES = 200;

export class UnknownLearningPathError extends Error {}
/** Mindestens eine Person gehört nicht zur Organisation (oder existiert nicht): bewusst nicht unterschieden. */
export class NotAMemberError extends Error {}
export class InvalidDueDateError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/** "2026-12-31" -> Ende dieses Tages (UTC). Vergangene Tage und Unsinn werden abgelehnt. */
export function parseDueDate(value: string | null | undefined, now: Date = new Date()): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InvalidDueDateError();
  const due = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value) throw new InvalidDueDateError();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime()) throw new InvalidDueDateError();
  return due;
}

export type AssignableLearningPath = { id: string; name: string; kind: CourseKind };

/**
 * Zuweisbar sind nur freigegebene (geprüfte) Lernpfade, die diese Firma nutzen darf: allgemeine mit Freigabe
 * für die Firma (company_course_entitlements) und die eigenen internen. Alles andere ist für die Firma nicht
 * auffindbar, auch nicht per ID.
 */
function assignableCondition(organizationId: string): SQL {
  return and(
    eq(certifications.catalogStatus, "approved"),
    or(
      and(eq(certifications.kind, "general"), eq(companyCourseEntitlements.organizationId, organizationId)),
      and(eq(certifications.kind, "internal"), eq(certifications.ownerOrganizationId, organizationId)),
    ),
  ) as SQL;
}

export async function listAssignableLearningPaths(organizationId: string): Promise<AssignableLearningPath[]> {
  return getDb()
    .select({ id: certifications.id, name: certifications.name, kind: certifications.kind })
    .from(certifications)
    .leftJoin(
      companyCourseEntitlements,
      and(
        eq(companyCourseEntitlements.certificationId, certifications.id),
        eq(companyCourseEntitlements.organizationId, organizationId),
      ),
    )
    .where(assignableCondition(organizationId))
    .orderBy(asc(certifications.name));
}

export type AssignableMember = { userId: string; name: string | null; email: string; role: CompanyRole };

export async function listAssignableMembers(organizationId: string): Promise<AssignableMember[]> {
  return getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export type AssignResult = { assigned: string[]; alreadyAssigned: string[] };

/**
 * Weist den Lernpfad den Personen zu. Wer ihn schon hat (auch abgeschlossen), bleibt unverändert und
 * steht in `alreadyAssigned`. Alles oder nichts: ist eine Person kein Mitglied, wird niemand zugewiesen.
 */
export async function assignLearningPath(input: {
  organizationId: string;
  assignedByUserId: string;
  userIds: string[];
  certificationId: string;
  dueAt: Date | null;
}): Promise<AssignResult> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0 || userIds.length > MAX_ASSIGNEES) throw new NotAMemberError();

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [path] = await tx
      .select({ id: certifications.id })
      .from(certifications)
      .leftJoin(
        companyCourseEntitlements,
        and(
          eq(companyCourseEntitlements.certificationId, certifications.id),
          eq(companyCourseEntitlements.organizationId, input.organizationId),
        ),
      )
      .where(and(eq(certifications.id, input.certificationId), assignableCondition(input.organizationId)))
      .limit(1);
    if (!path) throw new UnknownLearningPathError();

    const members = await tx
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, input.organizationId),
          inArray(organizationMemberships.userId, userIds),
        ),
      );
    if (members.length !== userIds.length) throw new NotAMemberError();

    const inserted = await tx
      .insert(companyAssignments)
      .values(
        userIds.map((userId) => ({
          organizationId: input.organizationId,
          userId,
          certificationId: input.certificationId,
          dueAt: input.dueAt,
          assignedByUserId: input.assignedByUserId,
        })),
      )
      .onConflictDoNothing()
      .returning({ userId: companyAssignments.userId });
    const assigned = inserted.map((r) => r.userId);
    return { assigned, alreadyAssigned: userIds.filter((id) => !assigned.includes(id)) };
  });

  if (result.assigned.length > 0) {
    await recordAuditEvent({
      actorUserId: input.assignedByUserId,
      action: "assignment.created",
      targetType: "certification",
      targetId: input.certificationId,
      metadata: {
        organizationId: input.organizationId,
        count: result.assigned.length,
        dueAt: input.dueAt?.toISOString() ?? null,
      },
    }).catch(logAuditFailure);
  }
  return result;
}

/** Ändert die Frist einer noch nicht abgeschlossenen Zuweisung der eigenen Organisation. */
export async function updateAssignmentDueDate(
  organizationId: string,
  assignmentId: string,
  dueAt: Date | null,
  actorUserId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .update(companyAssignments)
    .set({ dueAt })
    .where(
      and(
        eq(companyAssignments.id, assignmentId),
        eq(companyAssignments.organizationId, organizationId),
        ne(companyAssignments.status, "completed"),
      ),
    )
    .returning({ id: companyAssignments.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId,
    action: "assignment.due_changed",
    targetType: "assignment",
    targetId: row.id,
    metadata: { organizationId, dueAt: dueAt?.toISOString() ?? null },
  }).catch(logAuditFailure);
  return true;
}

/** Entfernt eine noch nicht abgeschlossene Zuweisung der eigenen Organisation (Abgeschlossenes bleibt bestehen). */
export async function removeAssignment(
  organizationId: string,
  assignmentId: string,
  actorUserId: string,
): Promise<boolean> {
  const [row] = await getDb()
    .delete(companyAssignments)
    .where(
      and(
        eq(companyAssignments.id, assignmentId),
        eq(companyAssignments.organizationId, organizationId),
        ne(companyAssignments.status, "completed"),
      ),
    )
    .returning({ id: companyAssignments.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId,
    action: "assignment.removed",
    targetType: "assignment",
    targetId: row.id,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}

/** Überfällig: Frist liegt in der Vergangenheit und der Lernpfad ist nicht abgeschlossen. */
export function isOverdue(
  entry: { status: string; dueAt: Date | null },
  now: Date = new Date(),
): boolean {
  return entry.status !== "completed" && entry.dueAt !== null && entry.dueAt.getTime() < now.getTime();
}
