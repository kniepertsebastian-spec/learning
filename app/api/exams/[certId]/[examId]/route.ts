import { isCertificationHidden, isExamHidden } from "@/lib/server/catalog/access";
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

  const { certId, examId } = await params;
  if ((await isCertificationHidden(session.user.id, certId)) || (await isExamHidden(session.user.id, examId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const examData = await getExamWithQuestions(examId);

    // Wie in app/cert/[id]/final-exam/[examId]/page.tsx: isCorrect und
    // Erklärungen nie vor der Abgabe ausliefern - sonst stünden die Lösungen
    // für jeden angemeldeten Nutzer im Netzwerk-Tab. Die Korrektheit prüft
    // der attempt-Endpunkt ohnehin serverseitig.
    return NextResponse.json({
      exam: examData.exam,
      questions: examData.questions.map((q) => ({
        questionId: q.questionId,
        orderNum: q.orderNum,
        question: q.question,
        options: q.options.map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum })),
      })),
    });
  } catch (error) {
    console.error("Error fetching exam:", error);
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
}
