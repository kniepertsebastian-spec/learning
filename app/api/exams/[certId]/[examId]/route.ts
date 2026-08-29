import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { getExamWithQuestions } from "@/lib/server/exam/generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string; examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { examId } = await params;

  try {
    const examData = await getExamWithQuestions(examId);

    return NextResponse.json({
      exam: examData.exam,
      questions: examData.questions,
    });
  } catch (error) {
    console.error("Error fetching exam:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: error instanceof Error ? 404 : 500 });
  }
}
