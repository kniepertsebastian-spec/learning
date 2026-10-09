import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, courseCategories, domains, examAttempts, exams, examPlans, lessonCompletions, lessons, objectives, quizAttempts, quizzes, sections,
  EXAM_DELIVERY_MODES, type CourseCategoryColor, type ExamDeliveryMode, type ExamPlanStatus, type ExamProvider,
} from "@/lib/server/db/schema";
import { canViewCertification, type Viewer } from "@/lib/server/catalog/visibility";
import { getTopWeakObjectives } from "@/lib/server/study/session-service";
import { shortCodeOf } from "@/lib/dashboard/logic";
import { buildStudyPlan, DEFAULT_WEEKLY_HOURS, mondayOf, readiness, type PlanWeek } from "@/lib/exams/plan";

/** Prüfungsplaner (UI U8): Pläne gehören der Person; jede Abfrage filtert nach `userId`. */
export class PlanError extends Error {}
export class PlanNotFoundError extends PlanError {}

export interface PlanInput {
  certificationId: string;
  scheduledAt: Date | null;
  deliveryMode: ExamDeliveryMode | null;
  voucherExpiresAt: Date | null;
  retakeIncluded: boolean;
  weeklyGoalHours: number;
}

function validate(input: PlanInput) {
  if (input.deliveryMode !== null && !(EXAM_DELIVERY_MODES as readonly string[]).includes(input.deliveryMode)) throw new PlanError("Unbekannte Prüfungsart.");
  if (!Number.isInteger(input.weeklyGoalHours) || input.weeklyGoalHours < 1 || input.weeklyGoalHours > 40) throw new PlanError("Wochenziel: 1 bis 40 Stunden.");
}

/** Legt den Plan für den Kurs an oder aktualisiert den offenen (geplanten) Plan; ein Kurs hat höchstens einen offenen Plan je Person. */
export async function savePlan(viewer: NonNullable<Viewer>, input: PlanInput): Promise<string> {
  validate(input);
  const db = getDb();
  const [cert] = await db.select({ kind: certifications.kind, ownerOrganizationId: certifications.ownerOrganizationId, catalogStatus: certifications.catalogStatus }).from(certifications).where(eq(certifications.id, input.certificationId)).limit(1);
  if (!cert || !(await canViewCertification(viewer, cert))) throw new PlanNotFoundError();
  const [open] = await db.select({ id: examPlans.id }).from(examPlans).where(and(eq(examPlans.userId, viewer.id), eq(examPlans.certificationId, input.certificationId), eq(examPlans.status, "planned"))).limit(1);
  const values = { scheduledAt: input.scheduledAt, deliveryMode: input.deliveryMode, voucherExpiresAt: input.voucherExpiresAt, retakeIncluded: input.retakeIncluded, weeklyGoalHours: input.weeklyGoalHours, updatedAt: new Date() };
  if (open) {
    await db.update(examPlans).set({ ...values, remindersSent: {} }).where(eq(examPlans.id, open.id));
    return open.id;
  }
  const [row] = await db.insert(examPlans).values({ userId: viewer.id, certificationId: input.certificationId, ...values }).returning({ id: examPlans.id });
  return row.id;
}

export async function setPlanStatus(userId: string, planId: string, status: ExamPlanStatus): Promise<void> {
  const [row] = await getDb().update(examPlans).set({ status, updatedAt: new Date() }).where(and(eq(examPlans.id, planId), eq(examPlans.userId, userId))).returning({ id: examPlans.id });
  if (!row) throw new PlanNotFoundError();
}

export async function deletePlan(userId: string, planId: string): Promise<void> {
  const [row] = await getDb().delete(examPlans).where(and(eq(examPlans.id, planId), eq(examPlans.userId, userId))).returning({ id: examPlans.id });
  if (!row) throw new PlanNotFoundError();
}

export async function getOwnPlan(userId: string, planId: string) {
  const [row] = await getDb()
    .select({ plan: examPlans, certName: certifications.name, provider: certifications.provider, bookingUrl: certifications.bookingUrl })
    .from(examPlans)
    .innerJoin(certifications, eq(certifications.id, examPlans.certificationId))
    .where(and(eq(examPlans.id, planId), eq(examPlans.userId, userId)))
    .limit(1);
  if (!row) throw new PlanNotFoundError();
  return row;
}

export type PlannerCert = {
  id: string; slug: string; name: string; provider: string; version: string; shortCode: string; color: CourseCategoryColor;
  examProvider: ExamProvider | null; deliveryModes: ExamDeliveryMode[]; bookingUrl: string | null; testCenterUrl: string | null; successorNote: string | null;
  plan: null | { id: string; scheduledAt: string | null; deliveryMode: ExamDeliveryMode | null; voucherExpiresAt: string | null; retakeIncluded: boolean; weeklyGoalHours: number; status: ExamPlanStatus };
};

export interface PlannerOverview {
  certs: PlannerCert[];
  next: null | { cert: PlannerCert; daysLeft: number };
  readiness: { scores: Array<number | null>; reached: number; ready: boolean };
  weeks: Array<PlanWeek & { doneLessons: number; current: boolean; past: boolean }>;
  overflowMinutes: number;
  reminders: Array<{ kind: "voucher" | "retake" | "successor"; certName: string; detail: string | null }>;
}


/** Lernplan und Simulationsergebnisse für einen geplanten Kurs. */
export async function studyWeeksFor(userId: string, certificationId: string, examDate: Date, weeklyHours: number, now: Date) {
  const db = getDb();
  const attempts = await db
    .select({ score: examAttempts.score, at: examAttempts.completedAt })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(and(eq(examAttempts.userId, userId), eq(exams.certificationId, certificationId), isNotNull(examAttempts.completedAt)))
    .orderBy(asc(examAttempts.completedAt));
  const scores = attempts.map((a) => Number(a.score ?? 0));
  const sectionRows = await db
    .select({ id: sections.id, title: sections.title, minutes: sections.estimatedMinutes })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum));
  const ids = sectionRows.map((s) => s.id);
  const [done, quizDone, weak] = await Promise.all([
    ids.length ? db.select({ id: lessonCompletions.sectionId, at: lessonCompletions.completedAt }).from(lessonCompletions).where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, ids))) : [],
    ids.length ? db.select({ id: quizzes.sectionId, at: quizAttempts.completedAt }).from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId)).where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), inArray(quizzes.sectionId, ids))) : [],
    getTopWeakObjectives(userId, certificationId, 3),
  ]);
  const doneAt = new Map<string, Date>();
  for (const d of [...done, ...quizDone]) if (d.at && (!doneAt.has(d.id) || d.at < doneAt.get(d.id)!)) doneAt.set(d.id, d.at);
  const result = buildStudyPlan({ examDate, now, lessons: sectionRows.map((s) => ({ id: s.id, title: s.title.de, minutes: s.minutes, done: doneAt.has(s.id) })), weakTopics: weak.map((w) => w.objectiveTitle), weeklyHours });
  const monday = mondayOf(now).toISOString().slice(0, 10);
  return { scores, overflowMinutes: result.overflowMinutes, weeks: result.weeks.map((w) => ({ ...w, doneLessons: w.lessonIds.filter((id) => doneAt.has(id)).length, current: w.start === monday, past: w.start < monday })) };
}

/** Alles für `/exams`. */
export async function getPlannerOverview(viewer: NonNullable<Viewer>, visibleCondition: import("drizzle-orm").SQL | undefined, now: Date = new Date()): Promise<PlannerOverview> {
  const db = getDb();
  const [certRows, categories, plans] = await Promise.all([
    db.select().from(certifications).where(visibleCondition).orderBy(asc(certifications.name)),
    db.select({ id: courseCategories.id, color: courseCategories.color }).from(courseCategories),
    db.select().from(examPlans).where(and(eq(examPlans.userId, viewer.id), inArray(examPlans.status, ["planned", "failed"]))).orderBy(desc(examPlans.updatedAt)),
  ]);
  const colorOf = new Map(categories.map((c) => [c.id, c.color]));
  const certs: PlannerCert[] = certRows.map((c) => {
    const p = plans.find((x) => x.certificationId === c.id);
    return {
      id: c.id, slug: c.slug, name: c.name, provider: c.provider, version: c.examVersion, shortCode: shortCodeOf(c.name, c.shortCode), color: (c.categoryId && colorOf.get(c.categoryId)) || "info",
      examProvider: c.examProvider, deliveryModes: c.deliveryModes, bookingUrl: c.bookingUrl, testCenterUrl: c.testCenterUrl, successorNote: c.successorNote,
      plan: p ? { id: p.id, scheduledAt: p.scheduledAt?.toISOString() ?? null, deliveryMode: p.deliveryMode, voucherExpiresAt: p.voucherExpiresAt?.toISOString() ?? null, retakeIncluded: p.retakeIncluded, weeklyGoalHours: p.weeklyGoalHours, status: p.status } : null,
    };
  });

  const upcoming = certs
    .filter((c) => c.plan?.status === "planned" && c.plan.scheduledAt && new Date(c.plan.scheduledAt).getTime() >= now.getTime() - 86_400_000)
    .sort((a, b) => new Date(a.plan!.scheduledAt!).getTime() - new Date(b.plan!.scheduledAt!).getTime())[0];
  const next = upcoming ? { cert: upcoming, daysLeft: Math.max(0, Math.ceil((new Date(upcoming.plan!.scheduledAt!).getTime() - now.getTime()) / 86_400_000)) } : null;

  let scores: number[] = [];
  let weeks: PlannerOverview["weeks"] = [];
  let overflowMinutes = 0;
  const focus = next?.cert ?? null;
  if (focus) {
    const r = await studyWeeksFor(viewer.id, focus.id, new Date(focus.plan!.scheduledAt!), focus.plan!.weeklyGoalHours || DEFAULT_WEEKLY_HOURS, now);
    scores = r.scores;
    weeks = r.weeks;
    overflowMinutes = r.overflowMinutes;
  }

  const reminders: PlannerOverview["reminders"] = [];
  for (const c of certs) {
    const p = c.plan;
    if (p?.voucherExpiresAt) {
      const days = Math.ceil((new Date(p.voucherExpiresAt).getTime() - now.getTime()) / 86_400_000);
      if (days >= 0 && days <= 60) reminders.push({ kind: "voucher", certName: c.name, detail: String(days) });
    }
    if (p?.status === "failed" && p.retakeIncluded) reminders.push({ kind: "retake", certName: c.name, detail: null });
    if (p && c.successorNote) reminders.push({ kind: "successor", certName: c.name, detail: c.successorNote });
  }
  return { certs, next, readiness: { scores: readiness(scores).last, reached: readiness(scores).reached, ready: readiness(scores).ready }, weeks, overflowMinutes, reminders };
}
