import { isCertificationHidden, isExamHidden } from "@/lib/server/catalog/access";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { ExamNotFoundError, InvalidExamSubmissionError, parseExamAttemptInput, submitExamAttempt } from "@/lib/server/exam/attempt";
import { getServerLocale } from "@/lib/server/locale";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string; examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId, examId } = await params;
  if ((await isCertificationHidden(session.user.id, certId)) || (await isExamHidden(session.user.id, examId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const locale = await getServerLocale();

  try {
    const input = parseExamAttemptInput(await request.json().catch(() => null));
    // Geprüft wird serverseitig gegen die Fragen der Prüfung (lib/server/exam/attempt.ts); die Antwort enthält keine Lösungen.
    const result = await submitExamAttempt(session.user.id, examId, input, locale);
    return NextResponse.json({
      attemptId: result.attemptId,
      score: result.score,
      passed: result.passed,
      readiness: result.scoring.readinessLevel,
      readinessLabel: result.scoring.readinessLabel,
      readinessConfidence: result.scoring.readinessConfidence,
      results: result.results,
      analysis: {
        domainPerformance: result.scoring.domainPerformance,
        weakObjectives: result.scoring.weakObjectives,
        recommendations: result.scoring.recommendations,
        comparison: result.scoring.comparison,
      },
    });
  } catch (error) {
    if (error instanceof InvalidExamSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ExamNotFoundError) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    console.error("Error submitting exam:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
