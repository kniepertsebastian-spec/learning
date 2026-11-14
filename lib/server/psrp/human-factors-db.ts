import { and, eq, inArray, isNotNull, lte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, examPlans, itemStates, learningPreferences, objectives, questions, recallChecks, reviewLog, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { computeHumanFactorsByGroup, type HumanFactorsUser } from "./human-factors";

const DAY_MS = 86_400_000;

/** Liest die Rohdaten für Aufschieben, Regelmäßigkeit und Schlaf (nur Personen mit Evaluationsgruppe, nur bis zum Stichtag), anonymisiert. */
export async function loadHumanFactorsUsers(asOf: Date, hash: (userId: string) => string): Promise<HumanFactorsUser[]> {
  const db = getDb();
  const people = await db.select({ id: users.id, group: users.evaluationGroup, timeZone: users.timezone }).from(users).where(isNotNull(users.evaluationGroup));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const [reviews, goals, overdue, plans, recalls] = await Promise.all([
    db
      .select({ userId: reviewLog.userId, at: reviewLog.timestampUtc, localHour: reviewLog.localHour, weekday: reviewLog.weekday, predictedR: reviewLog.predictedR, certificationId: domains.certificationId })
      .from(reviewLog)
      .innerJoin(questions, eq(questions.id, reviewLog.itemId))
      .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(inArray(reviewLog.userId, ids), lte(reviewLog.timestampUtc, asOf))),
    db.select({ userId: learningPreferences.userId, goal: learningPreferences.weeklyGoalDays }).from(learningPreferences).where(inArray(learningPreferences.userId, ids)),
    db.select({ userId: itemStates.userId, due: itemStates.due }).from(itemStates).where(and(inArray(itemStates.userId, ids), lt(itemStates.due, asOf))),
    db
      .select({ userId: examPlans.userId, certificationId: examPlans.certificationId, at: examPlans.scheduledAt })
      .from(examPlans)
      .where(and(inArray(examPlans.userId, ids), isNotNull(examPlans.scheduledAt), lte(examPlans.scheduledAt, asOf), sql`${examPlans.status} <> 'cancelled'`)),
    db
      .select({ userId: recallChecks.userId, lessonCompletedAt: recallChecks.lessonCompletedAt, hoursSinceLesson: recallChecks.hoursSinceLesson, status: recallChecks.status, questionCount: recallChecks.questionCount, correctCount: recallChecks.correctCount })
      .from(recallChecks)
      .where(and(inArray(recallChecks.userId, ids), lte(recallChecks.createdAt, asOf))),
  ]);
  const goalOf = new Map(goals.map((g) => [g.userId, g.goal]));
  return people.map((p) => ({
    userHash: hash(p.id),
    group: p.group as EvaluationGroup,
    timeZone: p.timeZone,
    weeklyGoalDays: goalOf.get(p.id) ?? 4,
    reviews: reviews.filter((r) => r.userId === p.id).map(({ userId: _u, ...r }) => r),
    // Tage seit der Fälligkeit, ganze Tage nach unten: heute fällig und nicht wiederholt ist 0 Tage überfällig.
    overdueDays: overdue.filter((o) => o.userId === p.id).map((o) => Math.floor((asOf.getTime() - o.due.getTime()) / DAY_MS)),
    exams: plans.filter((x) => x.userId === p.id && x.at).map((x) => ({ certificationId: x.certificationId, at: x.at as Date })),
    recallChecks: recalls.filter((r) => r.userId === p.id).map(({ userId: _u, ...r }) => r),
  }));
}

export async function humanFactorsMetrics(asOf: Date, hash: (userId: string) => string) {
  return computeHumanFactorsByGroup(await loadHumanFactorsUsers(asOf, hash), asOf);
}
