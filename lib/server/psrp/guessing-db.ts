import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { quizAnswers, quizAttempts, reviewLog, studySessionItems, studySessions, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { computeGuessingByGroup, isRushed, type BaseTime, type GuessingUser } from "./guessing";

/**
 * Basiszeit je Frage (Aufgabe 13): Median und Zahl aller gemessenen Antwortzeiten in review_log, optional bis zu einem Stichtag.
 * Anders als `getItemBaseTimeMs` ohne Rückfall auf den Kurs: für „durchgeklickt“ zählt nur die Frage selbst.
 */
export async function itemBaseTimes(itemIds: string[], asOf?: Date): Promise<Map<string, BaseTime>> {
  if (itemIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      itemId: reviewLog.itemId,
      median: sql<number>`percentile_cont(0.5) within group (order by ${reviewLog.responseTimeMs})`,
      n: sql<number>`count(*)::int`,
    })
    .from(reviewLog)
    .where(and(inArray(reviewLog.itemId, [...new Set(itemIds)]), isNotNull(reviewLog.responseTimeMs), asOf ? lte(reviewLog.timestampUtc, asOf) : undefined))
    .groupBy(reviewLog.itemId);
  return new Map(rows.map((r) => [r.itemId, { medianMs: Number(r.median), n: Number(r.n) }]));
}

/** Rohdaten für den Export: Reviews mit Zeit und Antworten mit `changedAnswer` (nur Personen mit Evaluationsgruppe, bis zum Stichtag). */
export async function loadGuessingUsers(asOf: Date): Promise<GuessingUser[]> {
  const db = getDb();
  const people = await db.select({ id: users.id, group: users.evaluationGroup }).from(users).where(isNotNull(users.evaluationGroup));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const [timed, quiz, session] = await Promise.all([
    db
      .select({ userId: reviewLog.userId, sessionId: reviewLog.sessionId, itemId: reviewLog.itemId, ms: reviewLog.responseTimeMs, rating: reviewLog.rawRating })
      .from(reviewLog)
      .where(and(inArray(reviewLog.userId, ids), isNotNull(reviewLog.responseTimeMs), lte(reviewLog.timestampUtc, asOf))),
    db
      .select({ userId: quizAttempts.userId, changed: quizAnswers.changedAnswer, correct: quizAnswers.isCorrect })
      .from(quizAnswers)
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
      .where(and(inArray(quizAttempts.userId, ids), isNotNull(quizAnswers.changedAnswer), lte(quizAttempts.startedAt, asOf))),
    db
      .select({ userId: studySessions.userId, changed: studySessionItems.changedAnswer, outcome: studySessionItems.outcome })
      .from(studySessionItems)
      .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
      .where(and(inArray(studySessions.userId, ids), isNotNull(studySessionItems.changedAnswer), isNotNull(studySessionItems.outcome), lte(studySessions.createdAt, asOf))),
  ]);
  const bases = await itemBaseTimes(timed.map((r) => r.itemId), asOf);
  return people.map((p) => ({
    group: p.group as EvaluationGroup,
    // Rating 1 („nochmal“) ist falsch, alles darüber richtig.
    reviews: timed.filter((r) => r.userId === p.id).map((r) => ({ sessionId: r.sessionId, correct: r.rating > 1, rushed: isRushed(r.ms, bases.get(r.itemId)) })),
    answers: [
      ...quiz.filter((a) => a.userId === p.id).map((a) => ({ changed: a.changed === true, correct: a.correct })),
      ...session.filter((a) => a.userId === p.id).map((a) => ({ changed: a.changed === true, correct: a.outcome === "correct" })),
    ],
  }));
}

export async function guessingMetrics(asOf: Date) {
  return computeGuessingByGroup(await loadGuessingUsers(asOf));
}
