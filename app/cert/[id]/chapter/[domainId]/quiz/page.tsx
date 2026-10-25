export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { SectionQuiz } from "@/components/SectionQuiz";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CHAPTER_PASS_PERCENT } from "@/lib/chapters/logic";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { drawChapterQuiz, getChapterOverview } from "@/lib/server/chapters/service";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getLearningContext } from "@/lib/server/study/learning-context";
import { getServerLocale } from "@/lib/server/locale";

/**
 * „Sitzt das?“ am Kapitelende: bei jedem Aufruf 10 zufällig gezogene Fragen aus dem Pool des Kapitels (mindestens 30 Fragen).
 * Ein Neuladen oder „Neue Fragen“ zieht eine neue Zusammenstellung.
 */
export default async function ChapterQuizPage({ params }: { params: Promise<{ id: string; domainId: string }> }) {
  const { id: slug, domainId } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound(); // proxy.ts leitet nicht Angemeldete schon auf /login um
  const userId = session.user.id;
  const [cert] = await getDb().select().from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert || !cert.includeSectionQuizzes || (await isCertificationHidden(userId, cert.id))) notFound();
  const draw = await drawChapterQuiz(userId, domainId);
  if (!draw || draw.certificationId !== cert.id) notFound();

  const locale = await getServerLocale();
  const de = locale === "de";
  const overview = await getChapterOverview(userId, cert.id);
  const mine = overview.find((c) => c.domainId === domainId);
  const askConfidence = (await getLearningContext(userId).catch(() => null))?.intro.askConfidence ?? true;
  const here = `/cert/${slug}/chapter/${domainId}/quiz`;

  if (draw.questions.length === 0) {
    return (
      <Card data-testid="chapter-quiz-empty">
        <h1 className="text-xl font-semibold">{de ? "Sitzt das?" : "Does it stick?"} · {draw.domainName}</h1>
        <p className="mt-2 text-sm text-muted">{de ? "Für dieses Kapitel gibt es noch keine Fragen." : "There are no questions for this chapter yet."}</p>
        <Button asChild variant="secondary" className="mt-4"><Link href={`/cert/${slug}`}>{de ? "Zurück zum Kurs" : "Back to the course"}</Link></Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="chapter-quiz">
      {mine && !mine.lessonsDone && (
        <Card variant="inset" data-testid="chapter-quiz-hint">
          <p className="text-sm text-muted">
            {de
              ? `Du hast ${mine.sectionsDone} von ${mine.sectionTotal} Lektionen dieses Kapitels durchgearbeitet. Das Quiz geht trotzdem, abgeschlossen ist das Kapitel aber erst mit allen Lektionen und bestandenem Quiz.`
              : `You have worked through ${mine.sectionsDone} of ${mine.sectionTotal} lessons in this chapter. You can take the quiz anyway, but the chapter only counts as completed with all lessons done and the quiz passed.`}
          </p>
        </Card>
      )}
      <SectionQuiz
        // Eine neue Ziehung ist ein neues Quiz: Zustand der alten zurücksetzen.
        key={draw.questions.map((q) => q.id).join(",")}
        attemptUrl={`/api/chapters/${domainId}/attempt`}
        questions={draw.questions}
        certSlug={slug}
        locale={locale}
        contextLabel={`${de ? "Sitzt das?" : "Does it stick?"} · ${draw.domainName}`}
        askConfidence={askConfidence}
        passPercent={CHAPTER_PASS_PERCENT}
        resultActions={[
          { href: `/cert/${slug}`, label: de ? "Zurück zum Kurs" : "Back to the course", primary: true },
          // Neuer Aufruf = neue Ziehung aus dem Pool.
          { href: here, label: de ? "Neue Fragen ziehen" : "Draw new questions" },
        ]}
      />
    </div>
  );
}
