export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getServerLocale } from "@/lib/server/locale";
import { getExamWithQuestions } from "@/lib/server/exam/generator";
import { ExamSession } from "@/components/ExamSession";

export default async function FinalExamTakePage({
  params,
}: {
  params: Promise<{ id: string; examId: string }>;
}) {
  const { id: certSlug, examId } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
        </p>
      </div>
    );
  }

  let examData;
  try {
    examData = await getExamWithQuestions(examId);
  } catch {
    notFound();
  }

  // Never send isCorrect to the client before the exam is submitted - the
  // attempt endpoint re-checks correctness server-side, so the client only
  // needs option text + ids to render and collect the learner's choice.
  const questionsForClient = examData.questions.map((q) => ({
    questionId: q.questionId,
    orderNum: q.orderNum,
    question: q.question,
    options: q.options.map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum })),
  }));

  return (
    <div className="flex flex-1 flex-col">
      <ExamSession
        certSlug={certSlug}
        examId={examId}
        questions={questionsForClient}
        locale={locale}
      />
    </div>
  );
}
