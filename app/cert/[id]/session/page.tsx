export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getOrCreateStudySession, getStudySessionWithContent } from "@/lib/server/study/session-service";
import { pickPracticeSimulation } from "@/lib/server/simulations/service";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { StudySession } from "@/components/StudySession";

export default async function StudySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
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

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (!cert) notFound();
  if (!cert.includeSectionQuizzes) notFound(); // Übungssitzungen gibt es nur mit Lektionstests

  // R2.3: liest die bereits persistierte aktive Session oder baut eine neue -
  // idempotent, ein Reload dieser Seite ändert nichts an der Zusammenstellung.
  const summary = await getOrCreateStudySession(session.user.id, cert.id);
  const { items } = await getStudySessionWithContent(summary.id, session.user.id);

  const questionItems = items.flatMap((item) =>
    item.question
      ? [
          {
            itemId: item.itemId,
            category: item.category as "review" | "weak" | "new" | "recall" | "understand" | "win",
            questionId: item.question.questionId,
            understand: item.understand ?? undefined,
            recall: item.recall ? { sectionId: item.recall.sectionId, lessonTitle: item.recall.lessonTitle } : undefined,
            question: item.question.question,
            options: item.question.options,
          },
        ]
      : [],
  );
  const lessonItems = items.flatMap((item) =>
    item.lesson
      ? [{ itemId: item.itemId, sectionId: item.lesson.sectionId, title: item.lesson.title }]
      : [],
  );

  // Nach den Fragen eine Praxisaufgabe aus denselben Lernzielen (ungelöst oder mühsam gelöst), falls es eine gibt.
  const practice = await pickPracticeSimulation(session.user.id, questionItems.map((q) => q.questionId), summary.id);

  return (
    <div className="flex flex-1 flex-col">
      <StudySession
        key={summary.id}
        exitEnabled={isFeatureEnabled("exit_with_win", session.user.id)}
        practice={practice}
        certSlug={slug}
        sessionId={summary.id}
        deescalated={summary.deescalated}
        questionItems={questionItems}
        lessonItems={lessonItems}
        locale={locale}
      />
    </div>
  );
}
