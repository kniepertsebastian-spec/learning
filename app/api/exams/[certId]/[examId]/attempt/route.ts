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
  objectiveProgress,
  domains,
  objectives,
} from "@/lib/server/db/schema";

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
    }

    const score =
      body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

    // Create exam attempt
    const attemptInserted = await db
      .insert(examAttempts)
      .values({
        examId,
        userId: session.user.id,
        score: String(score),
        completedAt: new Date(),
      })
      .returning();

    // Calculate readiness based on score
    let readiness = "NEEDS_PREPARATION";
    if (score >= 80) {
      readiness = "WELL_PREPARED";
    } else if (score >= 70) {
      readiness = "ADEQUATELY_PREPARED";
    } else if (score >= 60) {
      readiness = "SOMEWHAT_PREPARED";
    }

    // Analyze performance by domain
    const questionData = await db
      .select({
        questionId: questions.id,
        objectiveId: questions.objectiveId,
      })
      .from(questions)
      .where(inArray(questions.id, questionIds));

    const objectiveIds = [...new Set(questionData.map((q) => q.objectiveId))];
    const objectivesData = await db
      .select({
        objectiveId: objectives.id,
        domainId: objectives.domainId,
      })
      .from(objectives)
      .where(inArray(objectives.id, objectiveIds));

    const domainPerformance: Record<string, { correct: number; total: number }> = {};
    for (const obj of objectivesData) {
      if (!domainPerformance[obj.domainId]) {
        domainPerformance[obj.domainId] = { correct: 0, total: 0 };
      }

      const questionsInObjective = questionData.filter((q) => q.objectiveId === obj.objectiveId);
      for (const q of questionsInObjective) {
        const answerResult = results.find((r) => r.questionId === q.questionId);
        if (answerResult) {
          domainPerformance[obj.domainId].total++;
          if (answerResult.isCorrect) {
            domainPerformance[obj.domainId].correct++;
          }
        }
      }
    }

    // Calculate domain scores
    const domainScores = Object.entries(domainPerformance).map(([domainId, perf]) => ({
      domainId,
      score: perf.total > 0 ? Math.round((perf.correct / perf.total) * 100) : 0,
    }));

    return NextResponse.json({
      attemptId: attemptInserted[0].id,
      score,
      readiness,
      results,
      domainScores,
    });
  } catch (error) {
    console.error("Error submitting exam:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
