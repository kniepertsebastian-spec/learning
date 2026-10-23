export const dynamic = "force-dynamic";

import { loadSectionOutline } from "@/lib/server/sections/outline";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  sections,
  objectives,
  domains,
  lessonCompletions,
  lessons,
  questions,
  questionOptions,
} from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { listSimulationProgress } from "@/lib/server/simulations/service";
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

  // Funktionsumfang des Lernpfads: interne Lernpfade können ohne Lektionstests bestehen („reine Absolvierung“).
  const [certRow] = domainRows[0]
    ? await db
        .select({ includeSectionQuizzes: certifications.includeSectionQuizzes, contentLocale: certifications.contentLocale, translationStatus: certifications.translationStatus })
        .from(certifications)
        .where(eq(certifications.id, domainRows[0].certificationId))
        .limit(1)
    : [];
  const quizEnabled = certRow?.includeSectionQuizzes ?? true;
  const session = await auth();
  const outline = await loadSectionOutline(session?.user?.id ?? null, sectionId);
  const [certNameRow] = domainRows[0]
    ? await db.select({ name: certifications.name }).from(certifications).where(eq(certifications.id, domainRows[0].certificationId)).limit(1)
    : [];
  const certName = certNameRow?.name;
  let completed = false;
  if (session?.user?.id && !quizEnabled) {
    const [done] = await db
      .select({ id: lessonCompletions.id })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.userId, session.user.id), eq(lessonCompletions.sectionId, sectionId)))
      .limit(1);
    completed = Boolean(done);
  }

  // Fetch questions for this objective - R1.5: veraltete (stale) Fragen
  // nicht mehr an Lernende ausliefern, sie bleiben nur für bereits
  // bestehende Quiz-/Prüfungsverläufe lesbar.
  const questionRows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.objectiveId, objective.id), eq(questions.stale, false), eq(questions.probeOnly, false)));

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
        rationale: o.rationale,
      })),
    difficulty: q.difficulty,
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
      courseName={certName}
      lessonId={lesson.id}
      outline={outline}
      estimatedMinutes={section.estimatedMinutes}
      lesson={{
        content: lesson.content,
        keyTakeaways: lesson.keyTakeaways ?? null,
        examFocusPoints: lesson.examFocusPoints ?? null,
        cheatSheet: lesson.cheatSheet ?? null,
      }}
      questions={quizEnabled ? quizQuestions : []}
      quizEnabled={quizEnabled}
      signedIn={Boolean(session?.user?.id)}
      initialCompleted={completed}
      contentLocale={certRow?.contentLocale ?? "de"}
      translationPending={certRow?.translationStatus === "running"}
      exitEnabled={Boolean(session?.user?.id) && isFeatureEnabled("exit_with_win", session!.user!.id!)}
      pretestEnabled={Boolean(session?.user?.id) && isFeatureEnabled("pretest_questions", session!.user!.id!)}
      simulationProgress={session?.user?.id ? await listSimulationProgress(session.user.id, sectionId) : []}
    />
  );
}
