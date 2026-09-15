import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  objectives,
  questionOptions,
  quizAnswers,
  quizAttempts,
  quizzes,
  sections,
} from "@/lib/server/db/schema";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { recordReviewOutcomes } from "@/lib/server/review/service";

export class SectionNotFoundError extends Error {}

export interface SectionQuizAnswerInput {
  questionId: string;
  selectedOptionId: string;
}

export interface SectionQuizAttemptResult {
  score: number;
  results: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string }>;
  attemptId: string;
}

/**
 * Gemeinsame Grading-Logik für Abschnittsquiz-Versuche - genutzt vom Live-
 * Endpunkt (app/api/sections/[id]/attempt/route.ts) UND vom R4.3-Sync-
 * Endpunkt (lib/server/sync/service.ts) für offline aufgezeichnete
 * Versuche, damit beide Pfade exakt dieselben Seiteneffekte auslösen
 * (Objective-Progress, Review-Zustand).
 */
export async function recordSectionQuizAttempt(
  userId: string,
  sectionId: string,
  answers: SectionQuizAnswerInput[],
): Promise<SectionQuizAttemptResult> {
  const db = getDb();

  const certInfo = await db
    .select({ certificationId: domains.certificationId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!certInfo.length) {
    throw new SectionNotFoundError(`Section ${sectionId} nicht gefunden.`);
  }

  const existingQuiz = await db.select().from(quizzes).where(eq(quizzes.sectionId, sectionId)).limit(1);
  let quizId: string;
  if (existingQuiz.length) {
    quizId = existingQuiz[0].id;
  } else {
    const inserted = await db
      .insert(quizzes)
      .values({ sectionId, certificationId: certInfo[0].certificationId })
      .returning();
    quizId = inserted[0].id;
  }

  const attemptInserted = await db
    .insert(quizAttempts)
    .values({ quizId, userId, startedAt: new Date(), completedAt: new Date() })
    .returning();
  const attemptId = attemptInserted[0].id;

  const questionIds = answers.map((a) => a.questionId);
  const optionRows =
    questionIds.length > 0
      ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionIds))
      : [];

  const results: SectionQuizAttemptResult["results"] = [];
  let correctCount = 0;
  for (const answer of answers) {
    const correctOption = optionRows.find((o) => o.questionId === answer.questionId && o.isCorrect);
    const isCorrect = !!correctOption && correctOption.id === answer.selectedOptionId;
    if (isCorrect) correctCount++;
    results.push({
      questionId: answer.questionId,
      isCorrect,
      correctOptionId: correctOption?.id ?? "",
    });
  }

  if (answers.length > 0) {
    await db.insert(quizAnswers).values(
      answers.map((a) => ({
        quizAttemptId: attemptId,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId || null,
        isCorrect: results.find((r) => r.questionId === a.questionId)?.isCorrect ?? false,
      })),
    );
  }

  const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  await db.update(quizAttempts).set({ score: String(score) }).where(eq(quizAttempts.id, attemptId));

  await ObjectiveProgressService.updateProgressForQuizAttempt(userId, attemptId);
  await recordReviewOutcomes(
    userId,
    results.map((r) => ({ questionId: r.questionId, isCorrect: r.isCorrect })),
  );

  return { score, results, attemptId };
}
