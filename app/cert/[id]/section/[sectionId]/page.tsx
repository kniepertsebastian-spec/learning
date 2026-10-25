export const dynamic = "force-dynamic";

import { loadSectionOutline } from "@/lib/server/sections/outline";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  sections,
  objectives,
  domains,
  lessonCompletions,
  lessons,
} from "@/lib/server/db/schema";
import { getCompanyMembership } from "@/lib/server/company/access";
import { getLearningContext } from "@/lib/server/study/learning-context";
import { findMentorUserId } from "@/lib/server/company/mentor-requests";
import { frameworkGoalsForObjective } from "@/lib/server/company/framework-goals";
import { loadCourseRelevance } from "@/lib/server/relevance/service";
import { listTasksUnlockedBySection } from "@/lib/server/company/practice-tasks";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { listSimulationProgress } from "@/lib/server/simulations/service";
import { getChapterOverview } from "@/lib/server/chapters/service";
import { SectionContent } from "@/components/SectionContent";

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
  // „Sitzt das?“ gibt es nur noch am Kapitelende (Kapitel-Quiz); die Lektion selbst schließt man mit „Lektion abschließen“ ab.
  const chapterQuizAvailable = certRow?.includeSectionQuizzes ?? true;
  const quizEnabled = false;
  const session = await auth();
  const outline = await loadSectionOutline(session?.user?.id ?? null, sectionId);
  const [certNameRow] = domainRows[0]
    ? await db.select({ name: certifications.name }).from(certifications).where(eq(certifications.id, domainRows[0].certificationId)).limit(1)
    : [];
  const certName = certNameRow?.name;
  // Sicherheitsangabe erst ab der 3. Session, jederzeit abschaltbar; ohne Anmeldung/Offline gilt der bisherige Standard.
  const askConfidence = session?.user?.id ? (await getLearningContext(session.user.id).catch(() => null))?.intro.askConfidence ?? true : true;
  // „Ich hänge fest“ bei Simulationen: nur im Firmenbereich und nur, wenn der Person ein Mentor zugeordnet ist.
  const membership = session?.user?.id ? await getCompanyMembership(session.user.id) : null;
  const mentorAsk =
    membership && domainRows[0] && (await findMentorUserId(membership.organizationId, membership.userId))
      ? { topic: section.title.de, certificationId: domainRows[0].certificationId }
      : null;
  const examWeight = domainRows[0]?.weightPercent ? Number(domainRows[0].weightPercent) : null;
  const unlockTasks = membership ? await listTasksUnlockedBySection(membership.organizationId, membership.userId, sectionId).catch(() => []) : [];
  const frameworkGoals = membership ? await frameworkGoalsForObjective(membership.organizationId, objective.id).catch(() => []) : [];
  const courseRelevance = session?.user?.id && domainRows[0] ? await loadCourseRelevance(session.user.id, domainRows[0].certificationId).catch(() => null) : null;
  let completed = false;
  if (session?.user?.id) {
    const [done] = await db
      .select({ id: lessonCompletions.id })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.userId, session.user.id), eq(lessonCompletions.sectionId, sectionId)))
      .limit(1);
    completed = Boolean(done);
  }

  // Kapitel-Quiz: Link auf der letzten Lektion des Kapitels (Stand: Pool-Größe, bestes Ergebnis, bestanden).
  let chapterQuiz: { href: string; poolSize: number; isLast: boolean; passed: boolean; bestScore: number | null } | null = null;
  if (session?.user?.id && chapterQuizAvailable && domainRows[0]) {
    const chapter = (await getChapterOverview(session.user.id, domainRows[0].certificationId).catch(() => [])).find((c) => c.domainId === domainRows[0].id);
    if (chapter) {
      chapterQuiz = {
        href: `/cert/${certSlug}/chapter/${chapter.domainId}/quiz`,
        poolSize: chapter.poolSize,
        isLast: !outline?.nextId,
        passed: chapter.quizPassed,
        bestScore: chapter.bestScore,
      };
    }
  }

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
      questions={[]}
      quizEnabled={quizEnabled}
      chapterQuiz={chapterQuiz}
      signedIn={Boolean(session?.user?.id)}
      initialCompleted={completed}
      contentLocale={certRow?.contentLocale ?? "de"}
      translationPending={certRow?.translationStatus === "running"}
      mentorAsk={mentorAsk}
      relevance={{ examWeight: examWeight && examWeight > 0 ? Math.round(examWeight) : null, tasks: unlockTasks.map((t) => ({ title: t.title, unlocked: t.unlocked })), frameworkGoals, assignment: courseRelevance?.assignment ?? null, careerPaths: courseRelevance?.careerPaths ?? [] }}
      askConfidence={askConfidence}
      exitEnabled={Boolean(session?.user?.id) && isFeatureEnabled("exit_with_win", session!.user!.id!)}
      simulationProgress={session?.user?.id ? await listSimulationProgress(session.user.id, sectionId) : []}
    />
  );
}
