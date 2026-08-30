import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { examAttempts, exams, questions, questionOptions } from "@/lib/server/db/schema";
import { ExamScoringService } from "@/lib/server/exam/scoring";
import { getServerLocale } from "@/lib/server/locale";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string; attemptId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const db = getDb();
  const locale = await getServerLocale();

  try {
    // Fetch attempt
    const attempt = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, attemptId))
      .limit(1);

    if (!attempt.length || attempt[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const attemptRecord = attempt[0];

    // Fetch exam
    const examRecord = await db
      .select()
      .from(exams)
      .where(eq(exams.id, attemptRecord.examId))
      .limit(1);

    if (!examRecord.length) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Fetch all questions and answers for this attempt
    // (Note: in production, you'd store answer records in the database)
    // For now, return the attempt info and let frontend re-fetch questions if needed

    const score = attemptRecord.score ? Number(attemptRecord.score) : 0;

    return NextResponse.json({
      attempt: {
        id: attemptRecord.id,
        score,
        readiness: attemptRecord.readiness,
        completedAt: attemptRecord.completedAt,
        durationSeconds: attemptRecord.durationSeconds,
      },
      exam: {
        id: examRecord[0].id,
        blueprint: examRecord[0].blueprint,
      },
    });
  } catch (error) {
    console.error("Error fetching exam attempt:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
