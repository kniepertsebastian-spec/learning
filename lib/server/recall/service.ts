/** Rückblick „Was weißt du noch?“ (roadmap_didaktik Phase 8): Auswahl, Anlage, Überspringen, Abschluss. */
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  itemVariants,
  lessonCompletions,
  lessons,
  objectives,
  questions,
  quizAttempts,
  quizzes,
  recallChecks,
  sections,
  sessionDerived,
  studySessionItems,
  studySessions,
  users,
} from "@/lib/server/db/schema";
import { localTimeParts } from "@/lib/server/psrp/review-log";
import { lastShownByQuestion } from "@/lib/server/variants/rotation";
import { hoursBetween, pickRecallCandidate, RECALL_MAX_QUESTIONS, type RecallCandidate } from "./rules";

export interface RecallPlan {
  sectionId: string;
  lessonCompletedAt: Date;
  /** Original-Item (FSRS) und die gezeigte Variante, nie die Frage aus dem Lektionstest. */
  picks: Array<{ itemId: string; variantQuestionId: string }>;
}

/** Wann hat die Person die Lektion abgeschlossen? Abschluss = „Lektion abschließen“ oder abgeschlossener Lektionstest. */
async function lessonCompletionTimes(userId: string, sectionIds: string[]): Promise<Map<string, Date>> {
  const db = getDb();
  const [completions, attempts] = await Promise.all([
    db.select({ sectionId: lessonCompletions.sectionId, at: lessonCompletions.completedAt }).from(lessonCompletions).where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, sectionIds))),
    db
      .select({ sectionId: quizzes.sectionId, at: quizAttempts.completedAt })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), inArray(quizzes.sectionId, sectionIds))),
  ]);
  const first = new Map<string, Date>();
  for (const row of [...completions, ...attempts]) {
    if (!row.at || !row.sectionId) continue;
    const known = first.get(row.sectionId);
    if (!known || row.at < known) first.set(row.sectionId, row.at);
  }
  return first;
}

/**
 * Wählt die Lektion und bis zu drei Fragen für den Rückblick. Nur Varianten (`item_variant`, nicht das Original) von Items des
 * Lernziels, damit nie die Frage aus dem Lektionstest kommt; die am längsten nicht gezeigte Variante zuerst. Lektionen ohne
 * passende Variante entfallen (dann kommt die nächste an die Reihe). `excludeItemIds`: Items, die in der Session ohnehin dran sind.
 */
export async function planRecallCheck(userId: string, certificationId: string, now: Date, excludeItemIds: ReadonlySet<string>): Promise<RecallPlan | null> {
  const db = getDb();
  const sectionRows = await db
    .select({ id: sections.id, objectiveId: sections.objectiveId })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId));
  if (sectionRows.length === 0) return null;
  const sectionIds = sectionRows.map((s) => s.id);
  const completions = await lessonCompletionTimes(userId, sectionIds);
  const recalled = await db.select({ sectionId: recallChecks.sectionId }).from(recallChecks).where(and(eq(recallChecks.userId, userId), inArray(recallChecks.sectionId, sectionIds)));
  const alreadyRecalled = new Set(recalled.map((r) => r.sectionId));

  const remaining: RecallCandidate[] = [...completions].map(([sectionId, completedAt]) => ({ sectionId, completedAt }));
  const tried = new Set<string>(alreadyRecalled);
  for (let guard = 0; guard < remaining.length; guard++) {
    const candidate = pickRecallCandidate(remaining, now, tried);
    if (!candidate) return null;
    tried.add(candidate.sectionId);
    const objectiveId = sectionRows.find((s) => s.id === candidate.sectionId)!.objectiveId;
    const picks = await pickVariants(userId, objectiveId, excludeItemIds);
    if (picks.length > 0) return { sectionId: candidate.sectionId, lessonCompletedAt: candidate.completedAt, picks };
  }
  return null;
}

async function pickVariants(userId: string, objectiveId: string, excludeItemIds: ReadonlySet<string>): Promise<RecallPlan["picks"]> {
  const db = getDb();
  const rows = await db
    .select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId })
    .from(itemVariants)
    .innerJoin(questions, eq(questions.id, itemVariants.questionId))
    .where(
      and(
        eq(itemVariants.active, true),
        ne(itemVariants.source, "original"),
        eq(questions.stale, false),
        inArray(itemVariants.itemId, db.select({ id: questions.id }).from(questions).where(and(eq(questions.objectiveId, objectiveId), eq(questions.stale, false), eq(questions.probeOnly, false)))),
      ),
    )
    .orderBy(asc(itemVariants.itemId), asc(itemVariants.createdAt));
  const byItem = new Map<string, string[]>();
  for (const r of rows) {
    if (excludeItemIds.has(r.itemId)) continue;
    byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r.questionId]);
  }
  const itemIds = [...byItem.keys()];
  const lastShown = await lastShownByQuestion(userId, itemIds);
  const never = -Infinity;
  const picks = itemIds.map((itemId) => {
    const variantQuestionId = byItem.get(itemId)!.reduce((best, q) => ((lastShown.get(`${itemId}:${q}`)?.getTime() ?? never) < (lastShown.get(`${itemId}:${best}`)?.getTime() ?? never) ? q : best));
    return { itemId, variantQuestionId };
  });
  return picks.slice(0, RECALL_MAX_QUESTIONS);
}

/** Legt den Rückblick mit seinen Messwerten an (Status `offered`). */
export async function createRecallCheck(input: { userId: string; sessionId: string; plan: RecallPlan; phiAtRecall: number; now: Date }): Promise<string> {
  const db = getDb();
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, input.userId)).limit(1);
  const timeZone = user?.timezone ?? "UTC";
  // Φ „beim Lernen“: Tagesform der letzten Session höchstens 24 h vor dem Abschluss der Lektion (Näherung; es gibt keinen Check-in beim Lesen).
  const [learningPhi] = await db
    .select({ phi: sessionDerived.phi })
    .from(sessionDerived)
    .innerJoin(studySessions, eq(studySessions.id, sessionDerived.sessionId))
    .where(
      and(
        eq(studySessions.userId, input.userId),
        lte(sessionDerived.createdAt, input.plan.lessonCompletedAt),
        gte(sessionDerived.createdAt, new Date(input.plan.lessonCompletedAt.getTime() - 24 * 3_600_000)),
      ),
    )
    .orderBy(desc(sessionDerived.createdAt))
    .limit(1);
  const [row] = await db
    .insert(recallChecks)
    .values({
      userId: input.userId,
      sessionId: input.sessionId,
      sectionId: input.plan.sectionId,
      questionCount: input.plan.picks.length,
      lessonCompletedAt: input.plan.lessonCompletedAt,
      hoursSinceLesson: hoursBetween(input.plan.lessonCompletedAt, input.now),
      phiAtLearning: learningPhi?.phi ?? null,
      hourAtLearning: localTimeParts(input.plan.lessonCompletedAt, timeZone).hour,
      phiAtRecall: input.phiAtRecall,
      hourAtRecall: localTimeParts(input.now, timeZone).hour,
    })
    .returning({ id: recallChecks.id });
  return row.id;
}

/** Überspringen am Session-Anfang: Rückblick-Fragen entfallen, der Rückblick wird als übersprungen festgehalten (Abbruchquote). */
export async function skipRecallCheck(sessionId: string, userId: string): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).limit(1);
    if (!session || (session.status !== "planned" && session.status !== "in_progress")) return 0;
    const removed = await tx
      .delete(studySessionItems)
      .where(and(eq(studySessionItems.sessionId, sessionId), eq(studySessionItems.category, "recall"), sql`${studySessionItems.outcome} is null`))
      .returning({ id: studySessionItems.id, recallCheckId: studySessionItems.recallCheckId });
    const ids = [...new Set(removed.map((r) => r.recallCheckId).filter((id): id is string => id !== null))];
    if (ids.length > 0) await tx.update(recallChecks).set({ status: "skipped" }).where(and(inArray(recallChecks.id, ids), eq(recallChecks.status, "offered")));
    return removed.length;
  });
}

/** Nach dem Abschluss der Session: Ergebnis der Rückblicke festhalten. */
export async function recordRecallResults(results: Array<{ recallCheckId: string; isCorrect: boolean }>): Promise<void> {
  const byCheck = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const entry = byCheck.get(r.recallCheckId) ?? { total: 0, correct: 0 };
    entry.total++;
    if (r.isCorrect) entry.correct++;
    byCheck.set(r.recallCheckId, entry);
  }
  const db = getDb();
  for (const [id, { correct }] of byCheck) {
    await db.update(recallChecks).set({ status: "answered", correctCount: correct }).where(eq(recallChecks.id, id));
  }
}
