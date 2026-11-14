/** Fehlerart (4.8) und Hilfe-Verhalten (4.7) aus vorhandenen Tabellen laden (Aufgabe 15). Die Berechnung steckt in `error-types.ts`. */
import { and, eq, gt, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  concepts,
  itemConcepts,
  itemVariants,
  learningExits,
  mentorRequests,
  questions,
  quizAnswers,
  quizAttempts,
  reviewLog,
  sections,
  simulationResults,
  studySessionItems,
  studySessions,
  users,
  type EvaluationGroup,
} from "@/lib/server/db/schema";
import { classifyErrors, computeErrorTypesByGroup, computeHelpBehaviorByGroup, type ErrorAttempt, type ErrorType, type HelpUser, type PersonQuestion } from "./error-types";
import { itemBaseTimes } from "./guessing-db";
import { STABLE_BASE_MIN_N, type BaseTime } from "./guessing";

/** Schneller als die übliche Antwortzeit (Median) der Frage? Null ohne Zeit oder ohne stabile Basiszeit. */
export function fasterThanUsual(responseTimeMs: number | null | undefined, base: BaseTime | null | undefined): boolean | null {
  if (responseTimeMs === null || responseTimeMs === undefined || !base || base.n < STABLE_BASE_MIN_N || base.medianMs <= 0) return null;
  return responseTimeMs < base.medianMs;
}

export interface AttemptFilter {
  userIds?: string[];
  itemIds?: string[];
  /** Zeitraum der Antworten: ab `from` (einschließlich), nach `since` (ausschließlich), bis `to`. */
  from?: Date;
  since?: Date | null;
  to?: Date;
  /** Antwortzeiten laden (nur für Flüchtigkeit nötig, nicht für die Fehlvorstellung). */
  withTimes?: boolean;
}

export interface LoadedAttempt {
  userId: string;
  itemId: string;
  attempt: ErrorAttempt;
}

/** Bewertete Antworten auf Fragen: abgeschlossene Lernsitzungen (ohne Verstehens- und Voraussetzungs-Aufgaben) und Lektionstests. */
export async function loadErrorAttempts(filter: AttemptFilter): Promise<LoadedAttempt[]> {
  const db = getDb();
  if (filter.userIds?.length === 0 || filter.itemIds?.length === 0) return [];
  const [session, quiz] = await Promise.all([
    db
      .select({
        userId: studySessions.userId,
        sessionId: studySessions.id,
        itemId: studySessionItems.referenceId,
        variantQuestionId: studySessionItems.variantQuestionId,
        outcome: studySessionItems.outcome,
        confidence: studySessionItems.confidence,
        optionId: studySessionItems.selectedOptionId,
      })
      .from(studySessionItems)
      .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
      .where(
        and(
          eq(studySessions.status, "completed"),
          eq(studySessionItems.referenceType, "question"),
          notInArray(studySessionItems.category, ["understand", "prereq"]),
          isNotNull(studySessionItems.outcome),
          filter.userIds ? inArray(studySessions.userId, filter.userIds) : undefined,
          filter.itemIds ? inArray(studySessionItems.referenceId, filter.itemIds) : undefined,
          filter.from ? gte(studySessions.completedAt, filter.from) : undefined,
          filter.since ? gt(studySessions.completedAt, filter.since) : undefined,
          filter.to ? lte(studySessions.completedAt, filter.to) : undefined,
        ),
      ),
    db
      .select({
        userId: quizAttempts.userId,
        itemId: quizAnswers.questionId,
        correct: quizAnswers.isCorrect,
        confidence: quizAnswers.confidence,
        optionId: quizAnswers.selectedOptionId,
        ms: quizAnswers.responseTimeMs,
      })
      .from(quizAnswers)
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
      .where(
        and(
          filter.userIds ? inArray(quizAttempts.userId, filter.userIds) : undefined,
          filter.itemIds ? inArray(quizAnswers.questionId, filter.itemIds) : undefined,
          filter.from ? gte(quizAttempts.startedAt, filter.from) : undefined,
          filter.since ? gt(quizAttempts.startedAt, filter.since) : undefined,
          filter.to ? lte(quizAttempts.startedAt, filter.to) : undefined,
        ),
      ),
  ]);

  const times = new Map<string, number>();
  let bases = new Map<string, BaseTime>();
  if (filter.withTimes) {
    const sessionIds = [...new Set(session.map((s) => s.sessionId))];
    if (sessionIds.length > 0) {
      const logged = await db
        .select({ sessionId: reviewLog.sessionId, itemId: reviewLog.itemId, ms: reviewLog.responseTimeMs })
        .from(reviewLog)
        .where(and(inArray(reviewLog.sessionId, sessionIds), isNotNull(reviewLog.responseTimeMs)));
      for (const l of logged) if (l.sessionId && l.ms !== null) times.set(`${l.sessionId}:${l.itemId}`, l.ms);
    }
    bases = await itemBaseTimes([...session.map((s) => s.itemId), ...quiz.map((q) => q.itemId)], filter.to);
  }
  const fast = (itemId: string, ms: number | null | undefined) => (filter.withTimes ? fasterThanUsual(ms, bases.get(itemId)) : null);
  return [
    ...session.map((s) => ({
      userId: s.userId,
      itemId: s.itemId,
      attempt: { shownQuestionId: s.variantQuestionId ?? s.itemId, correct: s.outcome === "correct", optionId: s.optionId, sure: s.confidence === "sure", fast: fast(s.itemId, times.get(`${s.sessionId}:${s.itemId}`)) },
    })),
    ...quiz.map((q) => ({
      userId: q.userId,
      itemId: q.itemId,
      attempt: { shownQuestionId: q.itemId, correct: q.correct, optionId: q.optionId, sure: q.confidence === "sure", fast: fast(q.itemId, q.ms) },
    })),
  ];
}

/** Fehlerart je Person und Frage (Item). */
export function classifyByPersonAndItem(attempts: LoadedAttempt[]): Map<string, { userId: string; itemId: string; type: ErrorType | null; attempts: ErrorAttempt[] }> {
  const grouped = new Map<string, { userId: string; itemId: string; type: ErrorType | null; attempts: ErrorAttempt[] }>();
  for (const a of attempts) {
    const key = `${a.userId}:${a.itemId}`;
    const entry = grouped.get(key) ?? { userId: a.userId, itemId: a.itemId, type: null, attempts: [] };
    entry.attempts.push(a.attempt);
    grouped.set(key, entry);
  }
  for (const entry of grouped.values()) entry.type = classifyErrors(entry.attempts);
  return grouped;
}

/**
 * Verstehens-Modus nur bei Fehlvorstellung (Aufgabe 15): hat die Person bei mindestens einer Frage des Konzepts im Zeitraum eine
 * Fehlvorstellung? Antwortzeiten braucht es dafür nicht.
 */
export async function hasMisconception(userId: string, conceptItemIds: string[], from: Date, since: Date | null): Promise<boolean> {
  const attempts = await loadErrorAttempts({ userIds: [userId], itemIds: conceptItemIds, from, since });
  return [...classifyByPersonAndItem(attempts).values()].some((e) => e.type === "misconception");
}

/** Anzeigenamen: Frage → human_id, Item → Konzepte („Name [ID-Anfang]“, Namen sind nur je Kurs eindeutig). */
async function labels(itemIds: string[]) {
  const db = getDb();
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return { question: new Map<string, string>(), concepts: new Map<string, string[]>() };
  const [names, links] = await Promise.all([
    db.select({ id: questions.id, humanId: questions.humanId }).from(questions).where(inArray(questions.id, ids)),
    db
      .select({ itemId: itemConcepts.itemId, conceptId: concepts.id, name: concepts.name })
      .from(itemConcepts)
      .innerJoin(concepts, eq(concepts.id, itemConcepts.conceptId))
      .where(inArray(itemConcepts.itemId, ids)),
  ]);
  const byItem = new Map<string, string[]>();
  for (const l of links) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), `${l.name} [${l.conceptId.slice(0, 8)}]`]);
  return { question: new Map(names.map((n) => [n.id, n.humanId])), concepts: byItem };
}

async function evaluationPeople() {
  return getDb().select({ id: users.id, group: users.evaluationGroup }).from(users).where(isNotNull(users.evaluationGroup));
}

export async function loadErrorTypeRows(asOf: Date): Promise<PersonQuestion[]> {
  const people = await evaluationPeople();
  if (people.length === 0) return [];
  const groupOf = new Map(people.map((p) => [p.id, p.group as EvaluationGroup]));
  const grouped = classifyByPersonAndItem(await loadErrorAttempts({ userIds: people.map((p) => p.id), to: asOf, withTimes: true }));
  const named = await labels([...grouped.values()].map((e) => e.itemId));
  return [...grouped.values()].map((e) => ({
    group: groupOf.get(e.userId)!,
    question: named.question.get(e.itemId) ?? e.itemId,
    concepts: named.concepts.get(e.itemId) ?? [],
    attempts: e.attempts,
  }));
}

export async function loadHelpUsers(asOf: Date): Promise<HelpUser[]> {
  const db = getDb();
  const people = await evaluationPeople();
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const [sims, mentors, unanswered, exits] = await Promise.all([
    db
      .select({ userId: simulationResults.userId, objectiveId: sections.objectiveId, solves: simulationResults.solves, lastHelps: simulationResults.lastHelps })
      .from(simulationResults)
      .innerJoin(sections, eq(sections.id, simulationResults.sectionId))
      .where(and(inArray(simulationResults.userId, ids), lte(simulationResults.firstSolvedAt, asOf))),
    db
      .select({ userId: mentorRequests.userId, n: sql<number>`count(*)::int` })
      .from(mentorRequests)
      .where(and(inArray(mentorRequests.userId, ids), lte(mentorRequests.createdAt, asOf)))
      .groupBy(mentorRequests.userId),
    db
      .select({ userId: studySessions.userId, questionId: studySessionItems.referenceId, n: sql<number>`count(*)::int` })
      .from(studySessionItems)
      .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
      .where(
        and(
          inArray(studySessions.userId, ids),
          eq(studySessions.status, "completed"),
          lte(studySessions.completedAt, asOf),
          eq(studySessionItems.referenceType, "question"),
          notInArray(studySessionItems.category, ["understand", "prereq"]),
          isNull(studySessionItems.outcome),
        ),
      )
      .groupBy(studySessions.userId, studySessionItems.referenceId),
    db
      .select({ userId: learningExits.userId, questionId: learningExits.questionId, n: sql<number>`count(*)::int` })
      .from(learningExits)
      .where(and(inArray(learningExits.userId, ids), isNotNull(learningExits.questionId), lte(learningExits.createdAt, asOf)))
      .groupBy(learningExits.userId, learningExits.questionId),
  ]);

  // Notausstiege können an einer Variante hängen: auf das Item zurückführen.
  const exitQuestionIds = [...new Set(exits.flatMap((e) => (e.questionId ? [e.questionId] : [])))];
  const variantOf = new Map<string, string>();
  if (exitQuestionIds.length > 0) {
    const rows = await db.select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId }).from(itemVariants).where(inArray(itemVariants.questionId, exitQuestionIds));
    for (const r of rows) if (r.itemId !== r.questionId) variantOf.set(r.questionId, r.itemId);
  }
  const itemOf = (questionId: string) => variantOf.get(questionId) ?? questionId;

  // Konzepte je Lernziel: über die Fragen dieses Lernziels
  const objectiveIds = [...new Set(sims.map((s) => s.objectiveId))];
  const conceptsByObjective = new Map<string, Set<string>>();
  if (objectiveIds.length > 0) {
    const rows = await db
      .select({ objectiveId: questions.objectiveId, conceptId: concepts.id, name: concepts.name })
      .from(questions)
      .innerJoin(itemConcepts, eq(itemConcepts.itemId, questions.id))
      .innerJoin(concepts, eq(concepts.id, itemConcepts.conceptId))
      .where(inArray(questions.objectiveId, objectiveIds));
    for (const r of rows) conceptsByObjective.set(r.objectiveId, (conceptsByObjective.get(r.objectiveId) ?? new Set()).add(`${r.name} [${r.conceptId.slice(0, 8)}]`));
  }
  const named = await labels([...unanswered.map((u) => u.questionId), ...exits.map((e) => itemOf(e.questionId!))]);

  return people.map((p) => {
    const skips = new Map<string, { unanswered: number; exits: number }>();
    for (const u of unanswered) if (u.userId === p.id) skips.set(u.questionId, { unanswered: Number(u.n), exits: skips.get(u.questionId)?.exits ?? 0 });
    for (const e of exits) {
      if (e.userId !== p.id) continue;
      const item = itemOf(e.questionId!);
      const entry = skips.get(item) ?? { unanswered: 0, exits: 0 };
      entry.exits += Number(e.n);
      skips.set(item, entry);
    }
    return {
      group: p.group as EvaluationGroup,
      simulations: sims.filter((s) => s.userId === p.id).map((s) => ({ concepts: [...(conceptsByObjective.get(s.objectiveId) ?? [])], solves: s.solves, lastHelps: s.lastHelps })),
      mentorRequests: Number(mentors.find((m) => m.userId === p.id)?.n ?? 0),
      skips: [...skips.entries()].map(([itemId, s]) => ({ question: named.question.get(itemId) ?? itemId, concepts: named.concepts.get(itemId) ?? [], ...s })),
    };
  });
}

export async function errorTypeMetrics(asOf: Date) {
  return computeErrorTypesByGroup(await loadErrorTypeRows(asOf));
}

export async function helpBehaviorMetrics(asOf: Date) {
  return computeHelpBehaviorByGroup(await loadHelpUsers(asOf));
}
