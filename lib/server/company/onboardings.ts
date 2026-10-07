import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  companyAssignments,
  certifications,
  onboardingPlanCourses,
  onboardingPlans,
  onboardings,
  organizationMemberships,
  users,
  type OnboardingStatus,
} from "@/lib/server/db/schema";
import { assignLearningPath, listAssignableLearningPaths, NotAMemberError, MAX_ASSIGNEES } from "./assignments";
import { assertResponsible, InvalidResponsibleError } from "./modules";

/**
 * Onboarding-Pläne: eine Firma legt fest, welche Lernpfade (z. B. LPIC, CCNA) eine neue Person absolvieren muss und wer
 * als Mentor begleitet. Wird ein Plan einer Person zugewiesen, bekommt sie alle Lernpfade zugewiesen; der Mentor setzt
 * den Stand „besprochen“ bzw. „geprüft“ (geprüft erst, wenn alle Lernpfade abgeschlossen sind). Jede Funktion bekommt
 * `organizationId` aus der Mitgliedschaft und filtert immer danach; gelesen werden nur Zuweisungsstände, nie Lerndaten.
 */

export const MAX_PLAN_NAME = 120;
export const MAX_PLAN_DESCRIPTION = 2000;
export const MAX_PLAN_COURSES = 20;

export class InvalidPlanError extends Error {}
export class UnknownCourseError extends Error {}
export class PlanNotFoundError extends Error {}
export class OnboardingNotFoundError extends Error {}
export class NotAllowedToSetStatusError extends Error {}
export class CoursesNotCompletedError extends Error {}
export class StatusFinalError extends Error {}
export { InvalidResponsibleError, NotAMemberError };

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function cleanName(name: string): string {
  const value = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (value.length < 3 || value.length > MAX_PLAN_NAME) throw new InvalidPlanError();
  return value;
}

function cleanDescription(description: string | null | undefined): string | null {
  const value = (description ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (value.length > MAX_PLAN_DESCRIPTION) throw new InvalidPlanError();
  return value || null;
}

async function assertCourses(organizationId: string, certificationIds: string[]): Promise<string[]> {
  const unique = [...new Set(certificationIds)];
  if (unique.length < 1 || unique.length > MAX_PLAN_COURSES) throw new InvalidPlanError();
  const allowed = new Set((await listAssignableLearningPaths(organizationId)).map((p) => p.id));
  if (!unique.every((id) => allowed.has(id))) throw new UnknownCourseError();
  return unique;
}

export async function createOnboardingPlan(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string | null;
  mentorUserId?: string | null;
  certificationIds: string[];
}): Promise<{ id: string }> {
  const name = cleanName(input.name);
  const description = cleanDescription(input.description);
  const courseIds = await assertCourses(input.organizationId, input.certificationIds);
  const mentorUserId = input.mentorUserId ?? input.userId;
  await assertResponsible(input.organizationId, mentorUserId);

  const plan = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .insert(onboardingPlans)
      .values({ organizationId: input.organizationId, name, description, mentorUserId, createdByUserId: input.userId })
      .returning({ id: onboardingPlans.id });
    await tx.insert(onboardingPlanCourses).values(courseIds.map((certificationId, i) => ({ planId: row.id, certificationId, orderNum: i + 1 })));
    return row;
  });
  await recordAuditEvent({
    actorUserId: input.userId,
    action: "onboarding_plan.created",
    targetType: "onboarding_plan",
    targetId: plan.id,
    metadata: { organizationId: input.organizationId, courses: courseIds.length },
  }).catch(logAuditFailure);
  return plan;
}

export async function archiveOnboardingPlan(organizationId: string, planId: string, actorUserId: string): Promise<void> {
  const [row] = await getDb()
    .update(onboardingPlans)
    .set({ archivedAt: new Date() })
    .where(and(eq(onboardingPlans.id, planId), eq(onboardingPlans.organizationId, organizationId), isNull(onboardingPlans.archivedAt)))
    .returning({ id: onboardingPlans.id });
  if (!row) throw new PlanNotFoundError();
  await recordAuditEvent({
    actorUserId,
    action: "onboarding_plan.archived",
    targetType: "onboarding_plan",
    targetId: row.id,
    metadata: { organizationId },
  }).catch(logAuditFailure);
}

export type OnboardingPerson = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  status: OnboardingStatus;
  coursesDone: number;
  coursesTotal: number;
  startedAt: Date;
  discussedAt: Date | null;
  reviewedAt: Date | null;
};

export type OnboardingPlanView = {
  id: string;
  name: string;
  description: string | null;
  mentor: { userId: string; name: string | null; email: string } | null;
  courses: { id: string; name: string }[];
  people: OnboardingPerson[];
};

/** Alle aktiven Pläne der Firma mit Mentor, Lernpfaden und dem Stand jeder Person. */
export async function listOnboardingPlans(organizationId: string): Promise<OnboardingPlanView[]> {
  const db = getDb();
  const plans = await db
    .select()
    .from(onboardingPlans)
    .where(and(eq(onboardingPlans.organizationId, organizationId), isNull(onboardingPlans.archivedAt)))
    .orderBy(asc(onboardingPlans.name));
  if (plans.length === 0) return [];
  const planIds = plans.map((p) => p.id);

  const [courseRows, personRows, mentorRows] = await Promise.all([
    db
      .select({ planId: onboardingPlanCourses.planId, id: certifications.id, name: certifications.name, order: onboardingPlanCourses.orderNum })
      .from(onboardingPlanCourses)
      .innerJoin(certifications, eq(certifications.id, onboardingPlanCourses.certificationId))
      .where(inArray(onboardingPlanCourses.planId, planIds))
      .orderBy(asc(onboardingPlanCourses.orderNum)),
    db
      .select({
        id: onboardings.id,
        planId: onboardings.planId,
        userId: onboardings.userId,
        name: users.name,
        email: users.email,
        status: onboardings.status,
        startedAt: onboardings.startedAt,
        discussedAt: onboardings.discussedAt,
        reviewedAt: onboardings.reviewedAt,
      })
      .from(onboardings)
      .innerJoin(users, eq(users.id, onboardings.userId))
      .where(and(eq(onboardings.organizationId, organizationId), inArray(onboardings.planId, planIds)))
      .orderBy(asc(users.email)),
    db
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, plans.map((p) => p.mentorUserId).filter((x): x is string => !!x))),
  ]);

  const assignmentRows = personRows.length
    ? await db
        .select({ userId: companyAssignments.userId, certificationId: companyAssignments.certificationId, status: companyAssignments.status })
        .from(companyAssignments)
        .where(and(eq(companyAssignments.organizationId, organizationId), inArray(companyAssignments.userId, [...new Set(personRows.map((p) => p.userId))])))
    : [];
  const completed = new Set(assignmentRows.filter((a) => a.status === "completed").map((a) => `${a.userId}:${a.certificationId}`));
  const mentors = new Map(mentorRows.map((m) => [m.userId, m]));

  return plans.map((plan) => {
    const courses = courseRows.filter((c) => c.planId === plan.id).map((c) => ({ id: c.id, name: c.name }));
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      mentor: plan.mentorUserId ? (mentors.get(plan.mentorUserId) ?? null) : null,
      courses,
      people: personRows
        .filter((p) => p.planId === plan.id)
        .map((p) => ({
          id: p.id,
          userId: p.userId,
          name: p.name,
          email: p.email,
          status: p.status,
          coursesDone: courses.filter((c) => completed.has(`${p.userId}:${c.id}`)).length,
          coursesTotal: courses.length,
          startedAt: p.startedAt,
          discussedAt: p.discussedAt,
          reviewedAt: p.reviewedAt,
        })),
    };
  });
}

export type StartResult = { started: string[]; alreadyStarted: string[] };

/**
 * Weist den Plan Personen zu: alle Lernpfade des Plans werden zugewiesen (wer einen schon hat, behält ihn) und das
 * Onboarding beginnt mit Stand „offen“. Alles oder nichts: ist eine Person kein Mitglied, passiert nichts.
 */
export async function startOnboarding(input: { organizationId: string; actorUserId: string; planId: string; userIds: string[] }): Promise<StartResult> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0 || userIds.length > MAX_ASSIGNEES) throw new NotAMemberError();
  const db = getDb();
  const [plan] = await db
    .select({ id: onboardingPlans.id })
    .from(onboardingPlans)
    .where(and(eq(onboardingPlans.id, input.planId), eq(onboardingPlans.organizationId, input.organizationId), isNull(onboardingPlans.archivedAt)))
    .limit(1);
  if (!plan) throw new PlanNotFoundError();
  const members = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, input.organizationId), inArray(organizationMemberships.userId, userIds)));
  if (members.length !== userIds.length) throw new NotAMemberError();

  const courses = await db.select({ id: onboardingPlanCourses.certificationId }).from(onboardingPlanCourses).where(eq(onboardingPlanCourses.planId, plan.id));
  // Ein Lernpfad, der inzwischen nicht mehr zuweisbar ist (z. B. Freigabe entzogen), bricht ab, bevor das Onboarding beginnt.
  const allowed = new Set((await listAssignableLearningPaths(input.organizationId)).map((p) => p.id));
  if (!courses.every((c) => allowed.has(c.id))) throw new UnknownCourseError();
  for (const course of courses) {
    await assignLearningPath({ organizationId: input.organizationId, assignedByUserId: input.actorUserId, userIds, certificationId: course.id, dueAt: null });
  }
  const inserted = await db
    .insert(onboardings)
    .values(userIds.map((userId) => ({ planId: plan.id, organizationId: input.organizationId, userId })))
    .onConflictDoNothing()
    .returning({ userId: onboardings.userId });
  const started = inserted.map((r) => r.userId);
  if (started.length > 0) {
    await recordAuditEvent({
      actorUserId: input.actorUserId,
      action: "onboarding.started",
      targetType: "onboarding_plan",
      targetId: plan.id,
      metadata: { organizationId: input.organizationId, count: started.length },
    }).catch(logAuditFailure);
  }
  return { started, alreadyStarted: userIds.filter((id) => !started.includes(id)) };
}

/**
 * Setzt den Stand „besprochen“ oder „geprüft“. Nur der Mentor des Plans oder ein Firmen-Admin; „geprüft“ ist
 * endgültig und erst möglich, wenn alle Lernpfade des Plans für die Person abgeschlossen sind.
 */
export async function setOnboardingStatus(input: {
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  onboardingId: string;
  status: "discussed" | "reviewed";
}): Promise<OnboardingStatus> {
  const db = getDb();
  const [row] = await db
    .select({
      id: onboardings.id,
      userId: onboardings.userId,
      planId: onboardings.planId,
      status: onboardings.status,
      mentorUserId: onboardingPlans.mentorUserId,
    })
    .from(onboardings)
    .innerJoin(onboardingPlans, eq(onboardingPlans.id, onboardings.planId))
    .where(and(eq(onboardings.id, input.onboardingId), eq(onboardings.organizationId, input.organizationId)))
    .limit(1);
  if (!row) throw new OnboardingNotFoundError();
  if (input.actorRole !== "company_admin" && row.mentorUserId !== input.actorUserId) throw new NotAllowedToSetStatusError();
  if (row.status === "reviewed") throw new StatusFinalError();

  const now = new Date();
  if (input.status === "reviewed") {
    const courses = await db.select({ id: onboardingPlanCourses.certificationId }).from(onboardingPlanCourses).where(eq(onboardingPlanCourses.planId, row.planId));
    const done = await db
      .select({ id: companyAssignments.certificationId })
      .from(companyAssignments)
      .where(and(eq(companyAssignments.organizationId, input.organizationId), eq(companyAssignments.userId, row.userId), eq(companyAssignments.status, "completed")));
    const doneIds = new Set(done.map((d) => d.id));
    if (!courses.every((c) => doneIds.has(c.id))) throw new CoursesNotCompletedError();
  }
  await db
    .update(onboardings)
    .set(input.status === "reviewed" ? { status: "reviewed", reviewedAt: now, statusByUserId: input.actorUserId } : { status: "discussed", discussedAt: now, statusByUserId: input.actorUserId })
    .where(and(eq(onboardings.id, row.id), eq(onboardings.organizationId, input.organizationId)));
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: `onboarding.${input.status}`,
    targetType: "onboarding_plan",
    targetId: row.planId,
    metadata: { organizationId: input.organizationId },
  }).catch(logAuditFailure);
  return input.status;
}
