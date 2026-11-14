import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { learningExits, lessonReadingTime, lessons, quizAttempts, quizzes, reviewLog, studySessionItems, studySessions, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { computeSessionContextByGroup, countWords, type DeviceSession, type SessionContextUser, type SessionRatings } from "./session-context";

/** Liest die Rohdaten für Lesetiefe, Durchhalten und Gerät (nur Personen mit Evaluationsgruppe, nur bis zum Stichtag). */
export async function loadSessionContextUsers(asOf: Date): Promise<SessionContextUser[]> {
  const db = getDb();
  const people = await db.select({ id: users.id, group: users.evaluationGroup }).from(users).where(isNotNull(users.evaluationGroup));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);

  const [reading, firstScores, ratings, exits, sessionRows] = await Promise.all([
    db
      .select({ userId: lessonReadingTime.userId, sectionId: lessonReadingTime.sectionId, seconds: lessonReadingTime.seconds, opens: lessonReadingTime.opens, content: lessons.content })
      .from(lessonReadingTime)
      .innerJoin(lessons, eq(lessons.sectionId, lessonReadingTime.sectionId))
      .where(and(inArray(lessonReadingTime.userId, ids), lte(lessonReadingTime.updatedAt, asOf))),
    db
      .select({ userId: quizAttempts.userId, sectionId: quizzes.sectionId, score: quizAttempts.score, completedAt: quizAttempts.completedAt })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(inArray(quizAttempts.userId, ids), isNotNull(quizzes.sectionId), isNotNull(quizAttempts.completedAt), isNotNull(quizAttempts.score), lte(quizAttempts.completedAt, asOf)))
      .orderBy(asc(quizAttempts.completedAt)),
    db
      .select({ userId: reviewLog.userId, sessionId: reviewLog.sessionId, rating: reviewLog.rawRating })
      .from(reviewLog)
      .where(and(inArray(reviewLog.userId, ids), lte(reviewLog.timestampUtc, asOf)))
      .orderBy(asc(reviewLog.timestampUtc), asc(reviewLog.id)),
    db.select({ sessionId: learningExits.sessionId }).from(learningExits).where(and(inArray(learningExits.userId, ids), isNotNull(learningExits.sessionId), lte(learningExits.createdAt, asOf))),
    db
      .select({ id: studySessions.id, userId: studySessions.userId, deviceClass: studySessions.deviceClass })
      .from(studySessions)
      .where(and(inArray(studySessions.userId, ids), eq(studySessions.status, "completed"), lte(studySessions.completedAt, asOf))),
  ]);

  // Erster abgeschlossener Lektionstest je Person und Lektion (die Liste ist nach Abschluss sortiert).
  const firstScoreOf = new Map<string, number>();
  for (const a of firstScores) {
    const key = `${a.userId}:${a.sectionId}`;
    if (!firstScoreOf.has(key)) firstScoreOf.set(key, Number(a.score));
  }

  const exitedSessions = new Set(exits.flatMap((e) => (e.sessionId ? [e.sessionId] : [])));
  const ratingsBySession = new Map<string, { userId: string; ratings: number[] }>();
  for (const r of ratings) {
    const entry = ratingsBySession.get(r.sessionId) ?? { userId: r.userId, ratings: [] };
    entry.ratings.push(r.rating);
    ratingsBySession.set(r.sessionId, entry);
  }

  const items = sessionRows.length
    ? await db
        .select({ sessionId: studySessionItems.sessionId, outcome: studySessionItems.outcome })
        .from(studySessionItems)
        .where(and(inArray(studySessionItems.sessionId, sessionRows.map((s) => s.id)), isNotNull(studySessionItems.outcome)))
    : [];

  return people.map((p) => {
    const sessions: SessionRatings[] = [...ratingsBySession]
      .filter(([, v]) => v.userId === p.id)
      .map(([sessionId, v]) => ({ ratings: v.ratings, exited: exitedSessions.has(sessionId) }));
    const deviceSessions: DeviceSession[] = sessionRows
      .filter((s) => s.userId === p.id)
      .map((s) => {
        const own = items.filter((i) => i.sessionId === s.id);
        return { deviceClass: s.deviceClass, answered: own.length, correct: own.filter((i) => i.outcome === "correct").length };
      });
    return {
      group: p.group as EvaluationGroup,
      reading: reading
        .filter((r) => r.userId === p.id)
        .map((r) => ({
          seconds: r.seconds,
          opens: r.opens,
          // Der deutsche Text, sonst der englische: beide haben dieselbe Länge, solange sie aus demselben Kurs stammen.
          words: countWords(r.content.de || r.content.en || ""),
          firstQuizScore: firstScoreOf.get(`${p.id}:${r.sectionId}`) ?? null,
        })),
      sessions,
      deviceSessions,
    };
  });
}

export async function sessionContextMetrics(asOf: Date) {
  return computeSessionContextByGroup(await loadSessionContextUsers(asOf));
}
