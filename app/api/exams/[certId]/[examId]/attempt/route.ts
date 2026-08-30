import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  exams,
  examAttempts,
  questionOptions,
  questions,
} from "@/lib/server/db/schema";
import { ExamScoringService } from "@/lib/server/exam/scoring";
import { getServerLocale } from "@/lib/server/locale";

interface ExamAnswerPayload {
  answers: Array<{ questionId: string; selectedOptionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string; examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { examId } = await params;
  const body = (await request.json()) as ExamAnswerPayload;
  const db = getDb();
  const locale = await getServerLocale();

  try {
    // Verify exam exists
    const examRecord = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);

    if (!examRecord.length) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Evaluate answers
    const questionIds = body.answers.map((a) => a.questionId);
    const optionRows =
      questionIds.length > 0
        ? await db
            .select()
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, questionIds))
        : [];

    let correctCount = 0;
    const results: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string }> = [];
    const answerEvaluation: Array<{ questionId: string; isCorrect: boolean }> = [];

    for (const answer of body.answers) {
      const correctOption = optionRows.find(
        (o) => o.questionId === answer.questionId && o.isCorrect,
      );
      const isCorrect = !!correctOption && correctOption.id === answer.selectedOptionId;
      if (isCorrect) correctCount++;
      results.push({
        questionId: answer.questionId,
        isCorrect,
        correctOptionId: correctOption?.id ?? "",
      });
      answerEvaluation.push({
        questionId: answer.questionId,
        isCorrect,
      });
    }

    const score =
      body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

    // Use detailed scoring service for comprehensive analysis
    const scoringResult = await ExamScoringService.scoreExam(
      session.user.id,
      examId,
      answerEvaluation,
      locale,
    );

    // Create exam attempt with readiness
    const attemptInserted = await db
      .insert(examAttempts)
      .values({
        examId,
        userId: session.user.id,
        score: String(score),
        readiness: scoringResult.readinessLevel,
        completedAt: new Date(),
      })
      .returning();

    return NextResponse.json({
      attemptId: attemptInserted[0].id,
      score,
      readiness: scoringResult.readinessLevel,
      readinessLabel: scoringResult.readinessLabel,
      readinessConfidence: scoringResult.readinessConfidence,
      results,
      analysis: {
        domainPerformance: scoringResult.domainPerformance,
        weakObjectives: scoringResult.weakObjectives,
        recommendations: scoringResult.recommendations,
        comparison: scoringResult.comparison,
      },
    });
  } catch (error) {
    console.error("Error submitting exam:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
