import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  itemVariants,
  lessons,
  objectives,
  questionOptions,
  questions,
  quizAnswers,
  quizAttempts,
  quizzes,
  sections,
} from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { recordReviewOutcomes } from "@/lib/server/review/service";
import { sanitizeAnswer, type AnswerPayload } from "@/lib/questions/answer-formats";
import { gradeQuestionAnswer } from "@/lib/server/questions/grading";
import type { AnswerConfidence } from "@/lib/types";

export class SectionNotFoundError extends Error {}

export interface SectionQuizAnswerInput {
  questionId: string;
  selectedOptionId: string;
  /** Antwort bei den neuen Formaten (Reihenfolge, Kurzantwort, Zuordnung); `selectedOptionId` ist dann leer. */
  answer?: AnswerPayload | null;
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - optional,
   * fehlt z. B. bei alten, noch nicht aktualisierten Offline-Paketen. */
  confidence?: AnswerConfidence;
  /** Eingewebte Frage aus einer früheren Lektion (Flag `woven_reviews`): zählt nicht für das Ergebnis dieser Lektion, nur als Review. */
  woven?: boolean;
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
  allAnswers: SectionQuizAnswerInput[],
): Promise<SectionQuizAttemptResult> {
  const db = getDb();
  // Eingewebte Antworten zählen nicht für Ergebnis und Lernzielstand dieser Lektion (nur wenn das Flag gilt, sonst werden sie verworfen).
  const answers = allAnswers.filter((a) => !a.woven);
  const wovenAnswers = isFeatureEnabled("woven_reviews", userId) ? allAnswers.filter((a) => a.woven) : [];

  const certInfo = await db
    .select({ certificationId: domains.certificationId, objectiveId: sections.objectiveId })
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
  const [optionRows, formatRows] = await Promise.all([
    questionIds.length > 0 ? db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionIds)) : Promise.resolve([]),
    questionIds.length > 0 ? db.select({ id: questions.id, answerFormat: questions.answerFormat, answerData: questions.answerData }).from(questions).where(inArray(questions.id, questionIds)) : Promise.resolve([]),
  ]);
  const formatOf = new Map(formatRows.map((q) => [q.id, q]));

  const results: SectionQuizAttemptResult["results"] = [];
  let correctCount = 0;
  for (const answer of answers) {
    const format = formatOf.get(answer.questionId);
    const grade = gradeQuestionAnswer(
      { answerFormat: format?.answerFormat ?? "choice", answerData: format?.answerData ?? null },
      optionRows.filter((o) => o.questionId === answer.questionId),
      { selectedOptionId: answer.selectedOptionId, answer: answer.answer },
    );
    if (grade.correct) correctCount++;
    results.push({
      questionId: answer.questionId,
      isCorrect: grade.correct,
      correctOptionId: grade.correctOptionId,
    });
  }

  if (answers.length > 0) {
    await db.insert(quizAnswers).values(
      answers.map((a) => ({
        quizAttemptId: attemptId,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId || null,
        answer: sanitizeAnswer(a.answer),
        isCorrect: results.find((r) => r.questionId === a.questionId)?.isCorrect ?? false,
        confidence: a.confidence ?? null,
      })),
    );
  }

  const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  await db.update(quizAttempts).set({ score: String(score) }).where(eq(quizAttempts.id, attemptId));

  await ObjectiveProgressService.updateProgressForQuizAttempt(userId, attemptId);
  await recordReviewOutcomes(
    userId,
    results.map((r) => ({
      questionId: r.questionId,
      isCorrect: r.isCorrect,
      confidence: answers.find((a) => a.questionId === r.questionId)?.confidence ?? null,
    })),
  );

  if (wovenAnswers.length > 0) await recordWovenAnswers(userId, sectionId, certInfo[0], wovenAnswers);

  return { score, results, attemptId };
}

/**
 * Eingewebte Antworten als Reviews des Original-Items (`interleaved`, mit der Lektion, in der sie gestellt wurden). Nur Fragen
 * desselben Kurses aus einem anderen Lernziel; alles andere wird ignoriert.
 */
async function recordWovenAnswers(userId: string, sectionId: string, section: { certificationId: string; objectiveId: string }, answers: SectionQuizAnswerInput[]): Promise<void> {
  const db = getDb();
  const shownIds = [...new Set(answers.map((a) => a.questionId))];
  const valid = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(inArray(questions.id, shownIds), eq(domains.certificationId, section.certificationId), ne(questions.objectiveId, section.objectiveId)));
  const validIds = new Set(valid.map((v) => v.id));
  const [variantRows, optionRows, [lesson]] = await Promise.all([
    db.select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId }).from(itemVariants).where(and(inArray(itemVariants.questionId, shownIds), ne(itemVariants.itemId, itemVariants.questionId))),
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, shownIds)),
    db.select({ id: lessons.id }).from(lessons).where(eq(lessons.sectionId, sectionId)).limit(1),
  ]);
  const itemOf = new Map(variantRows.map((v) => [v.questionId, v.itemId]));
  await recordReviewOutcomes(
    userId,
    answers
      .filter((a) => validIds.has(a.questionId))
      .map((a) => {
        const correct = optionRows.find((o) => o.questionId === a.questionId && o.isCorrect);
        const itemId = itemOf.get(a.questionId) ?? a.questionId;
        return {
          questionId: itemId,
          variantQuestionId: itemId !== a.questionId ? a.questionId : null,
          isCorrect: !!correct && correct.id === a.selectedOptionId,
          confidence: a.confidence ?? null,
          reviewType: "interleaved" as const,
          wovenIntoLessonId: lesson?.id ?? null,
        };
      }),
  );
}
