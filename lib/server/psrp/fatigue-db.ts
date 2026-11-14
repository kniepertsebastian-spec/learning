import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { reviewLog, studySessionItems, studySessions, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { computeFatigue, computeFatigueByGroup, fatigueStatements, type FatigueSession, type FatigueUser } from "./fatigue";

/**
 * Abgeschlossene Sitzungen je Person bis zum Stichtag (Aufgabe 12): beantwortete Fragen in der Reihenfolge der Sitzung, die
 * Antwortzeit aus review_log (dieselbe Sitzung, dieselbe Frage) und die Unterbrechungen.
 */
export async function loadFatigueSessions(userIds: string[], asOf: Date): Promise<Map<string, FatigueSession[]>> {
  const out = new Map<string, FatigueSession[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return out;
  const db = getDb();
  const sessions = await db
    .select({ id: studySessions.id, userId: studySessions.userId, count: studySessions.interruptionCount, ms: studySessions.interruptionMs })
    .from(studySessions)
    .where(and(inArray(studySessions.userId, userIds), eq(studySessions.status, "completed"), lte(studySessions.completedAt, asOf)))
    .orderBy(asc(studySessions.completedAt));
  if (sessions.length === 0) return out;
  const ids = sessions.map((s) => s.id);
  const [items, times] = await Promise.all([
    db
      .select({ sessionId: studySessionItems.sessionId, questionId: studySessionItems.referenceId, outcome: studySessionItems.outcome })
      .from(studySessionItems)
      .where(and(inArray(studySessionItems.sessionId, ids), eq(studySessionItems.referenceType, "question"), isNotNull(studySessionItems.outcome)))
      .orderBy(asc(studySessionItems.sessionId), asc(studySessionItems.orderNum)),
    db
      .select({ sessionId: reviewLog.sessionId, questionId: reviewLog.itemId, ms: reviewLog.responseTimeMs })
      .from(reviewLog)
      .where(and(inArray(reviewLog.userId, userIds), inArray(reviewLog.sessionId, ids), isNotNull(reviewLog.responseTimeMs))),
  ]);
  const timeOf = new Map(times.map((t) => [`${t.sessionId}:${t.questionId}`, t.ms]));
  const itemsBySession = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsBySession.get(item.sessionId) ?? [];
    list.push(item);
    itemsBySession.set(item.sessionId, list);
  }
  for (const s of sessions) {
    out.get(s.userId)!.push({
      answers: (itemsBySession.get(s.id) ?? []).map((i) => ({ correct: i.outcome === "correct", responseTimeMs: timeOf.get(`${s.id}:${i.questionId}`) ?? null })),
      interruptions: s.count !== null && s.ms !== null ? { count: s.count, totalMs: s.ms } : null,
    });
  }
  return out;
}

/** Export (`psrp:metrics`): nur Personen mit Evaluationsgruppe. */
export async function fatigueMetrics(asOf: Date) {
  const people = await getDb().select({ id: users.id, group: users.evaluationGroup }).from(users).where(isNotNull(users.evaluationGroup));
  const byUser = await loadFatigueSessions(people.map((p) => p.id), asOf);
  const input: FatigueUser[] = people.map((p) => ({ group: p.group as EvaluationGroup, sessions: byUser.get(p.id) ?? [] }));
  return computeFatigueByGroup(input);
}

/** Aussagen für „Wie ich lerne“ (nur die eigene Person). */
export async function personalFatigueStatements(userId: string, now = new Date()) {
  const byUser = await loadFatigueSessions([userId], now);
  return fatigueStatements(computeFatigue(byUser.get(userId) ?? []));
}
