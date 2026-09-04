import { eq, inArray, and, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  exams,
  examQuestions,
  questions,
  questionOptions,
  objectives,
  quizAnswers,
  quizAttempts,
  domains,
} from "@/lib/server/db/schema";
import { buildExamBlueprint, type ExamBlueprint } from "./blueprint";

export interface ExamCreated {
  examId: string;
  totalQuestions: number;
  blueprint: ExamBlueprint;
}

/**
 * Generates a final practice exam for a learner.
 * Creates exam record and selects questions based on blueprint.
 * Avoids questions the learner has already answered in quizzes.
 */
export async function generateFinalExam(
  certificationId: string,
  userId: string,
  totalQuestions: number = 90,
): Promise<ExamCreated> {
  const db = getDb();

  // Build blueprint
  const blueprint = await buildExamBlueprint(certificationId, totalQuestions);

  // Get questions already answered by this user
  const answeredQuestionIds = await db
    .select({ questionId: quizAnswers.questionId })
    .from(quizAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
    .where(eq(quizAttempts.userId, userId));

  const answeredIds = new Set(answeredQuestionIds.map((a) => a.questionId));

  // Select questions for each domain
  const selectedQuestionIds: string[] = [];

  for (const domainBreakdown of blueprint.domainBreakdown) {
    // Get all objectives in this domain
    const objectivesInDomain = await db
      .select({ id: objectives.id })
      .from(objectives)
      .where(eq(objectives.domainId, domainBreakdown.domainId));

    const objectiveIds = objectivesInDomain.map((o) => o.id);

    if (objectiveIds.length === 0) continue;

    // Get available questions for this domain (not already answered, random order)
    const availableQuestions = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          inArray(questions.objectiveId, objectiveIds),
          // R1.5: veraltete Fragen (stale = Objective wurde durch eine neue
          // Quellenversion inhaltlich verändert) nicht mehr in neue Prüfungen
          // aufnehmen.
          eq(questions.stale, false),
          // Exclude already answered questions
          ...(!answeredIds.size ? [] : [notInArray(questions.id, Array.from(answeredIds))]),
        ),
      )
      .orderBy(() => sql`RANDOM()`)
      .limit(domainBreakdown.targetQuestions);

    selectedQuestionIds.push(...availableQuestions.map((q) => q.id));
  }

  if (selectedQuestionIds.length === 0) {
    throw new Error("No questions available for exam");
  }

  // Create exam record
  const examInserted = await db
    .insert(exams)
    .values({
      certificationId,
      blueprint: blueprint as unknown as Record<string, unknown>,
    })
    .returning();

  const examId = examInserted[0].id;

  // Create exam_questions records
  const examQuestionsData = selectedQuestionIds.map((questionId, index) => ({
    examId,
    questionId,
    orderNum: index + 1,
  }));

  await db.insert(examQuestions).values(examQuestionsData);

  return {
    examId,
    totalQuestions: selectedQuestionIds.length,
    blueprint,
  };
}

/**
 * Fetches an exam with its questions and options
 */
export async function getExamWithQuestions(examId: string) {
  const db = getDb();

  const examRecord = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);

  if (!examRecord.length) {
    throw new Error("Exam not found");
  }

  const examQuestionsRecords = await db
    .select({
      questionId: examQuestions.questionId,
      orderNum: examQuestions.orderNum,
      humanId: questions.humanId,
      question: questions.question,
      explanation: questions.explanation,
      difficulty: questions.difficulty,
    })
    .from(examQuestions)
    .innerJoin(questions, eq(questions.id, examQuestions.questionId))
    .where(eq(examQuestions.examId, examId))
    .orderBy(examQuestions.orderNum);

  // Fetch options for all questions
  const questionIds = examQuestionsRecords.map((q) => q.questionId);
  const optionsRecords =
    questionIds.length > 0
      ? await db
          .select({
            questionId: questionOptions.questionId,
            id: questionOptions.id,
            text: questionOptions.text,
            isCorrect: questionOptions.isCorrect,
            orderNum: questionOptions.orderNum,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.orderNum)
      : [];

  // Group options by question
  const optionsByQuestion = new Map<string, typeof optionsRecords>();
  optionsRecords.forEach((opt) => {
    if (!optionsByQuestion.has(opt.questionId)) {
      optionsByQuestion.set(opt.questionId, []);
    }
    optionsByQuestion.get(opt.questionId)!.push(opt);
  });

  return {
    exam: examRecord[0],
    questions: examQuestionsRecords.map((q) => ({
      ...q,
      options: optionsByQuestion.get(q.questionId) || [],
    })),
  };
}
