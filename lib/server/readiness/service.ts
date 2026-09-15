import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  examAttempts,
  exams,
  objectiveProgress,
  objectives,
  questions,
  reviewItems,
} from "@/lib/server/db/schema";
import { computeReadiness, type ReadinessResult } from "./engine";

const RECENT_EXAM_LIMIT = 3;

/**
 * R2.5 (roadmap.md): sammelt die Eingaben für computeReadiness() aus den
 * bereits bestehenden Tabellen - keine neue Persistenz nötig, Readiness ist
 * eine Ableitung, kein eigener Zustand. Nicht in dieser Sandbox gegen eine
 * echte DB getestet (mangels laufender Postgres-Instanz, siehe derselbe
 * Hinweis in blueprint-approval.ts) - die reine Berechnung ist vollständig
 * in engine.test.ts abgedeckt.
 */
export async function getReadiness(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<ReadinessResult> {
  const db = getDb();

  const [totalObjectivesRow, progressRows, examRows, answeredRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certificationId)),
    db
      .select({ masteryScore: objectiveProgress.masteryScore, lastAttemptAt: objectiveProgress.lastAttemptAt })
      .from(objectiveProgress)
      .innerJoin(objectives, eq(objectives.id, objectiveProgress.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(objectiveProgress.userId, userId), eq(domains.certificationId, certificationId))),
    db
      .select({ score: examAttempts.score, completedAt: examAttempts.completedAt })
      .from(examAttempts)
      .innerJoin(exams, eq(exams.id, examAttempts.examId))
      .where(
        and(
          eq(examAttempts.userId, userId),
          eq(exams.certificationId, certificationId),
          isNotNull(examAttempts.completedAt),
        ),
      )
      .orderBy(desc(examAttempts.completedAt))
      .limit(RECENT_EXAM_LIMIT),
    // "Anzahl der Versuche": review_items deckt Quiz-, Session- und
    // Exam-Antworten einheitlich ab (recordReviewOutcomes() wird von allen
    // drei Wegen aufgerufen, siehe R2.2/R2.3) - eine Zeile pro je
    // beantworteter Frage dieser Zertifizierung.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewItems)
      .innerJoin(questions, eq(questions.id, reviewItems.questionId))
      .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(reviewItems.userId, userId), eq(domains.certificationId, certificationId))),
  ]);

  const totalObjectives = totalObjectivesRow[0]?.count ?? 0;
  const attemptedObjectives = progressRows.length;
  const avgMasteryOverAttempted =
    attemptedObjectives > 0
      ? progressRows.reduce((sum, r) => sum + Number(r.masteryScore), 0) / attemptedObjectives
      : 0;

  const lastActivityTimestamps = [
    ...progressRows.map((r) => r.lastAttemptAt?.getTime()).filter((t): t is number => t !== undefined),
    ...examRows.map((r) => r.completedAt?.getTime()).filter((t): t is number => t !== undefined),
  ];
  const daysSinceLastActivity =
    lastActivityTimestamps.length > 0
      ? Math.max(0, Math.floor((now.getTime() - Math.max(...lastActivityTimestamps)) / (24 * 60 * 60 * 1000)))
      : null;

  const recentExamScores = examRows.map((r) => Number(r.score ?? 0));

  return computeReadiness({
    totalObjectives,
    attemptedObjectives,
    avgMasteryOverAttempted,
    daysSinceLastActivity,
    totalAnsweredQuestions: answeredRow[0]?.count ?? 0,
    recentExamScores,
  });
}
