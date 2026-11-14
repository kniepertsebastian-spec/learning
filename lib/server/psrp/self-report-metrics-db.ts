import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { quizAttempts, quizzes, recallChecks, selfReports, users } from "@/lib/server/db/schema";
import { computeSelfReportMetrics, type QuizOutcome, type RecallOutcome, type SelfReportRow } from "./self-report-metrics";

/** Liest die Selbstauskünfte von Personen mit Evaluationsgruppe bis zum Stichtag, dazu Rückblick und ersten Lektionstest zum Vergleich. */
export async function selfReportMetrics(asOf: Date) {
  const db = getDb();
  const people = await db.select({ id: users.id }).from(users).where(isNotNull(users.evaluationGroup));
  if (people.length === 0) return computeSelfReportMetrics([], [], []);
  const ids = people.map((p) => p.id);
  const [reports, recalls, attempts] = await Promise.all([
    db
      .select({ userKey: selfReports.userId, kind: selfReports.kind, value: selfReports.value, refId: selfReports.refId })
      .from(selfReports)
      .where(and(inArray(selfReports.userId, ids), lte(selfReports.createdAt, asOf))),
    db
      .select({ userKey: recallChecks.userId, sectionId: recallChecks.sectionId, questionCount: recallChecks.questionCount, correctCount: recallChecks.correctCount })
      .from(recallChecks)
      .where(and(inArray(recallChecks.userId, ids), eq(recallChecks.status, "answered"), isNotNull(recallChecks.correctCount), lte(recallChecks.createdAt, asOf))),
    db
      .select({ userKey: quizAttempts.userId, sectionId: quizzes.sectionId, score: quizAttempts.score })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(inArray(quizAttempts.userId, ids), isNotNull(quizzes.sectionId), isNotNull(quizAttempts.completedAt), isNotNull(quizAttempts.score), lte(quizAttempts.completedAt, asOf)))
      .orderBy(asc(quizAttempts.completedAt)),
  ]);
  // Erster abgeschlossener Test je Person und Lektion (die Liste ist nach Abschluss sortiert).
  const seen = new Set<string>();
  const first: QuizOutcome[] = [];
  for (const a of attempts) {
    const key = `${a.userKey}:${a.sectionId}`;
    if (seen.has(key) || !a.sectionId) continue;
    seen.add(key);
    first.push({ userKey: a.userKey, sectionId: a.sectionId, score: Number(a.score) });
  }
  return computeSelfReportMetrics(
    reports as SelfReportRow[],
    recalls.map((r) => ({ ...r, correctCount: r.correctCount ?? 0 })) as RecallOutcome[],
    first,
  );
}
