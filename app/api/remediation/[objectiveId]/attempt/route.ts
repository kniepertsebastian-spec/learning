import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { questionOptions, remediationSessions, objectiveProgress } from "@/lib/server/db/schema";
import { RemediationService } from "@/lib/server/remediation/service";
import { ObjectiveProgressService } from "@/lib/server/progress/service";

interface RemediationAnswerPayload {
  sessionId: string;
  objectiveId: string;
  answers: Array<{ questionId: string; selectedOptionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { objectiveId } = await params;
  const body = (await request.json()) as RemediationAnswerPayload;
  const db = getDb();

  try {
    // Verify session belongs to this user
    const sessionRecord = await db
      .select()
      .from(remediationSessions)
      .where(eq(remediationSessions.id, body.sessionId))
      .limit(1);

    if (!sessionRecord.length || sessionRecord[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    // Get mastery before attempt
    const beforeMastery = await db
      .select()
      .from(objectiveProgress)
      .where(eq(objectiveProgress.objectiveId, objectiveId))
      .limit(1);

    const beforeScore = beforeMastery.length > 0 ? Number(beforeMastery[0].masteryScore) : 0;

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

    const score = body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

    // Check if improved (at least 10% gain)
    const improved = score >= beforeScore + 10;

    // Update remediation session outcome
    await RemediationService.updateRemediationOutcome(body.sessionId, improved);

    return NextResponse.json({
      score,
      results,
      improved,
      previousScore: beforeScore,
      improvementNeeded: 10,
    });
  } catch (error) {
    console.error("Error submitting remediation attempt:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
