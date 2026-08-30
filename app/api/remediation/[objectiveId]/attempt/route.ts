import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { remediationSessions, objectiveProgress } from "@/lib/server/db/schema";
import { RemediationService } from "@/lib/server/remediation/service";
import type { RemediationResponse } from "@/lib/server/ai/service";

interface RemediationAnswerPayload {
  sessionId: string;
  answers: Array<{ questionIndex: number; selectedOptionIndex: number }>;
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
    // Verify session belongs to this user and load its stored content -
    // remediation questions are generated on-the-fly (not persisted in the
    // questions table), so correctness has to be checked against the
    // session's own stored content, not the question bank.
    const sessionRecord = await db
      .select()
      .from(remediationSessions)
      .where(eq(remediationSessions.id, body.sessionId))
      .limit(1);

    if (!sessionRecord.length || sessionRecord[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const content = sessionRecord[0].content as RemediationResponse | null;
    if (!content?.questions?.length) {
      return NextResponse.json({ error: "Session has no stored questions" }, { status: 400 });
    }

    // Get mastery before attempt
    const beforeMastery = await db
      .select()
      .from(objectiveProgress)
      .where(eq(objectiveProgress.objectiveId, objectiveId))
      .limit(1);

    const beforeScore = beforeMastery.length > 0 ? Number(beforeMastery[0].masteryScore) : 0;

    // Evaluate answers server-side against the session's stored questions
    let correctCount = 0;
    const results: Array<{ questionIndex: number; isCorrect: boolean }> = [];

    for (const answer of body.answers) {
      const question = content.questions[answer.questionIndex];
      const isCorrect = question?.options[answer.selectedOptionIndex]?.isCorrect ?? false;
      if (isCorrect) correctCount++;
      results.push({ questionIndex: answer.questionIndex, isCorrect });
    }

    const score =
      body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

    // Check if improved (at least 10% gain)
    const improved = score >= beforeScore + 10;

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
