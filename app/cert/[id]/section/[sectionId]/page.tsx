export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  sections,
  objectives,
  domains,
  lessons,
  questions,
  questionOptions,
} from "@/lib/server/db/schema";
import { SectionContent } from "@/components/SectionContent";
import type { SectionQuizQuestion } from "@/components/SectionQuiz";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string; sectionId: string }>;
}) {
  const { id: certSlug, sectionId } = await params;
  const db = getDb();

  // Fetch section
  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!sectionRows.length) notFound();
  const section = sectionRows[0];

  // Fetch objective + domain in parallel with lesson
  const [objectiveRows, lessonRows] = await Promise.all([
    db.select().from(objectives).where(eq(objectives.id, section.objectiveId)).limit(1),
    db.select().from(lessons).where(eq(lessons.sectionId, sectionId)).limit(1),
  ]);

  if (!objectiveRows.length || !lessonRows.length) notFound();
  const objective = objectiveRows[0];
  const lesson = lessonRows[0];

  // Fetch domain
  const domainRows = await db
    .select()
    .from(domains)
    .where(eq(domains.id, objective.domainId))
    .limit(1);
  const domainName = domainRows[0]?.name ?? "";

  // Fetch questions for this objective - R1.5: veraltete (stale) Fragen
  // nicht mehr an Lernende ausliefern, sie bleiben nur für bereits
  // bestehende Quiz-/Prüfungsverläufe lesbar.
  const questionRows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.objectiveId, objective.id), eq(questions.stale, false)));

  const questionIds = questionRows.map((q) => q.id);
  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.orderNum)
      : [];

  const quizQuestions: SectionQuizQuestion[] = questionRows.map((q) => ({
    id: q.id,
    question: q.question,
    explanation: q.explanation,
    options: optionRows
      .filter((o) => o.questionId === q.id)
      .map((o) => ({
        id: o.id,
        text: o.text,
        orderNum: o.orderNum,
        isCorrect: o.isCorrect,
      })),
    sourceReference: q.sourceReference,
  }));

  return (
    <SectionContent
      certSlug={certSlug}
      sectionId={sectionId}
      sectionTitle={section.title}
      objectiveCode={objective.code}
      objectiveTitle={objective.title}
      domainName={domainName}
      lesson={{
        content: lesson.content,
        keyTakeaways: lesson.keyTakeaways ?? null,
        examFocusPoints: lesson.examFocusPoints ?? null,
      }}
      questions={quizQuestions}
    />
  );
}
