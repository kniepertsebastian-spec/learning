export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getOrCreateStudySession, getStudySessionWithContent } from "@/lib/server/study/session-service";
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

  // R2.3: liest die bereits persistierte aktive Session oder baut eine neue -
  // idempotent, ein Reload dieser Seite ändert nichts an der Zusammenstellung.
  const summary = await getOrCreateStudySession(session.user.id, cert.id);
  const { items } = await getStudySessionWithContent(summary.id, session.user.id);

  const questionItems = items.flatMap((item) =>
    item.question
      ? [
          {
            itemId: item.itemId,
            category: item.category as "review" | "weak" | "new",
            questionId: item.question.questionId,
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

  return (
    <div className="flex flex-1 flex-col">
      <StudySession
        certSlug={slug}
        sessionId={summary.id}
        questionItems={questionItems}
        lessonItems={lessonItems}
        locale={locale}
      />
    </div>
  );
}
