"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardList, ListTree, Target } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { RichText } from "@/components/RichText";
import { SectionQuiz } from "@/components/SectionQuiz";
import type { SectionQuizQuestion } from "@/components/SectionQuiz";
import { ContentLanguageSwitch } from "@/components/lesson/ContentLanguageSwitch";
import { LessonPhases } from "@/components/lesson/LessonPhases";
import { LessonPretest } from "@/components/lesson/LessonPretest";
import { LessonSimulationsProvider } from "@/components/lesson/LessonSimulations";
import { OutlineList } from "@/components/lesson/OutlineList";
import { ReadingProgress } from "@/components/lesson/ReadingProgress";
import { TocList } from "@/components/lesson/TocList";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { pickPretestQuestions } from "@/lib/lesson/pretest";
import { extractToc, isHandsOn, readingMinutes } from "@/lib/markdown/toc";
import { fmt } from "@/lib/quiz/keys";
import type { SectionOutline } from "@/lib/server/sections/outline";
import type { Locale, Localized } from "@/lib/types";

interface SectionContentProps {
  certSlug: string;
  sectionId: string;
  sectionTitle: Localized<string>;
  objectiveCode: string;
  objectiveTitle: string;
  domainName: string;
  /** Kursname für den Breadcrumb. */
  courseName?: string;
  lessonId?: string;
  lesson: {
    content: Localized<string>;
    keyTakeaways: Localized<string[]> | null;
    examFocusPoints: Localized<string[]> | null;
    /** Merkzettel zum Nachschlagen (Markdown); bei älteren Lektionen leer. */
    cheatSheet?: Localized<string> | null;
  };
  questions: SectionQuizQuestion[];
  /** Gliederung der Domain; fehlt im Offline-Reader. */
  outline?: SectionOutline | null;
  estimatedMinutes?: number | null;
  /** R4.1/4.2/4.3: siehe SectionQuiz - wird im Offline-Reader gesetzt. */
  offline?: { userId: string };
  /** false: Lernpfad ohne Lektionstests; statt des Quiz gibt es „Lektion abschließen“. Standard true. */
  quizEnabled?: boolean;
  /** Notausstieg „Heute reicht's“ im Lektionstest (Flag exit_with_win). */
  exitEnabled?: boolean;
  /** Sicherheitsangabe im Lektionstest (ab der 3. Session, abschaltbar). */
  askConfidence?: boolean;
  /** Firmenbereich mit zugeordnetem Mentor: „Ich hänge fest“ bei Simulationen. */
  mentorAsk?: { topic: string; certificationId: string } | null;
  signedIn?: boolean;
  initialCompleted?: boolean;
  /** Sprache, in der der Kurs erzeugt wurde; ohne Angabe (Offline-Reader) kein Hinweis auf eine fehlende Übersetzung. */
  contentLocale?: Locale | null;
  /** Übersetzung in die zweite Sprache läuft gerade. */
  translationPending?: boolean;
  /** Gelöste Simulationen dieser Person in dieser Lektion. */
  simulationProgress?: Array<{ simIndex: number; bestHelps: number }>;
  /** Feature-Flag `pretest_questions`: zwei Vorabfragen vor dem Lektionstext (ohne Wertung). */
  pretestEnabled?: boolean;
  /** „Warum lerne ich das?“: Gewicht der Domäne in der Prüfung und Praxisaufgaben, die diese Lektion freischaltet (nur Firmenbereich). */
  relevance?: { examWeight: number | null; tasks: Array<{ title: string; unlocked: boolean }> } | null;
}

export function SectionContent({
  certSlug,
  sectionId,
  sectionTitle,
  objectiveCode,
  objectiveTitle,
  domainName,
  courseName,
  lessonId,
  lesson,
  questions,
  outline = null,
  estimatedMinutes = null,
  offline,
  quizEnabled = true,
  exitEnabled,
  askConfidence,
  mentorAsk,
  signedIn = true,
  initialCompleted = false,
  contentLocale = null,
  translationPending = false,
  simulationProgress = [],
  pretestEnabled = false,
  relevance = null,
}: SectionContentProps) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [showQuiz, setShowQuiz] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [completed, setCompleted] = useState(initialCompleted);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const pretestQuestions = pretestEnabled && quizEnabled && !initialCompleted ? pickPretestQuestions(questions, sectionId) : [];
  const [pretestState, setPretestState] = useState<"pending" | "done">("pending");
  const pretestPending = pretestQuestions.length > 0 && pretestState === "pending";

  const content = lesson.content[locale];
  // Einsprachig erzeugte Lektionen tragen denselben Text in beiden Feldern, bis der Übersetzungslauf sie füllt.
  const availableLocales: Locale[] = lesson.content.de !== lesson.content.en ? ["de", "en"] : contentLocale ? [contentLocale] : [];
  const toc = extractToc(content);
  const minutes = estimatedMinutes ?? readingMinutes(content);
  const hasQuiz = quizEnabled && questions.length > 0;
  const lp = t.lesson_page;

  async function completeLesson() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
      setCompleted(true);
      router.refresh();
    } catch {
      setCompleteError(lp.completeFailed);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <LessonSimulationsProvider text={content} sectionId={sectionId} persist={signedIn && !offline} offlineUserId={offline?.userId} initialProgress={simulationProgress} mentorAsk={offline ? null : (mentorAsk ?? null)}>
    <div className="flex flex-1 flex-col" data-testid="lesson-page">
      <ReadingProgress />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-subtle">
          <Link href={offline ? `/cert/${certSlug}/offline` : "/"} className="hover:text-foreground">{lp.overview}</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/cert/${certSlug}`} className="hover:text-foreground">{courseName ?? certSlug}</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate">{domainName}</span>
          <span aria-hidden="true">/</span>
          <span className="truncate text-foreground" aria-current="page">{sectionTitle[locale]}</span>
        </nav>
        <div className="flex flex-wrap items-start gap-2">
          <ContentLanguageSwitch available={availableLocales} translationPending={translationPending} />
          {outline && (
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOutlineOpen(true)} iconLeft={<ListTree className="h-4 w-4" aria-hidden="true" />} data-testid="open-outline">
              {lp.outline}
            </Button>
          )}
          {lesson.cheatSheet?.[locale] && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/cert/${certSlug}/cheatsheets`}><ClipboardList className="h-4 w-4" aria-hidden="true" />{lp.cheatSheet}</Link>
            </Button>
          )}
          {hasQuiz && !showQuiz && (
            <Button size="sm" onClick={() => setShowQuiz(true)} data-testid="start-quiz-top">{lp.startQuiz}</Button>
          )}
        </div>
      </div>

      {outline && (
        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetContent side="left" className="w-[min(320px,88vw)]">
            <SheetTitle>{lp.outline}</SheetTitle>
            <SheetDescription className="sr-only">{lp.openOutline}</SheetDescription>
            <div className="mt-4"><OutlineList outline={outline} certSlug={certSlug} onNavigate={() => setOutlineOpen(false)} /></div>
          </SheetContent>
        </Sheet>
      )}

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
        {outline && (
          <aside className="hidden lg:block">
            <div className="sticky top-6"><OutlineList outline={outline} certSlug={certSlug} /></div>
          </aside>
        )}

        <div className={outline ? "min-w-0" : "min-w-0 lg:col-span-2 xl:col-span-3"}>
          <article className="mx-auto w-full max-w-[740px]" data-testid="lesson-article">
            <header className="mb-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {outline && <Badge tone="neutral">{fmt(lp.sectionXofY, { x: outline.position, y: outline.total })}</Badge>}
                <Badge tone="neutral">{fmt(lp.about, { n: minutes })}</Badge>
                {isHandsOn(content) && <Badge tone="mint">{lp.handsOn}</Badge>}
                <Badge tone="info">{objectiveCode}</Badge>
              </div>
              <h1 className="text-[28px] leading-[1.15] font-semibold tracking-tight sm:text-[38px]">{sectionTitle[locale]}</h1>
              <p className="mt-2 text-sm text-subtle">{objectiveCode} · {objectiveTitle}</p>
            </header>

            {relevance && (relevance.examWeight !== null || relevance.tasks.length > 0) && (
              <Card className="mb-6" data-testid="lesson-why">
                <p className="mb-1 text-sm font-semibold">{locale === "de" ? "Warum lerne ich das?" : "Why am I learning this?"}</p>
                <ul className="flex flex-col gap-1 text-sm text-muted">
                  {relevance.examWeight !== null && (
                    <li>
                      {locale === "de"
                        ? `Der Bereich „${domainName}“ macht etwa ${relevance.examWeight} % der Prüfung aus.`
                        : `The “${domainName}” domain makes up about ${relevance.examWeight}% of the exam.`}
                    </li>
                  )}
                  {relevance.tasks.map((task) => (
                    <li key={task.title} data-testid={task.unlocked ? "lesson-task-unlocked" : "lesson-task-locked"}>
                      {task.unlocked ? (
                        <>
                          {locale === "de" ? "Praxisaufgabe freigeschaltet: " : "Practice task unlocked: "}
                          <Link href="/" className="text-link hover:underline">{task.title}</Link>
                        </>
                      ) : locale === "de" ? (
                        `Nach dieser Lektion wartet die Praxisaufgabe „${task.title}“.`
                      ) : (
                        `After this lesson, the practice task “${task.title}” awaits you.`
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {pretestQuestions.length > 0 && pretestPending && <LessonPretest questions={pretestQuestions} onDone={() => setPretestState("done")} />}

            <LessonPhases quizStarted={showQuiz} completed={completed} hasEvaluation={hasQuiz || !quizEnabled} pretest={pretestQuestions.length > 0 ? pretestState : undefined} />

            {!pretestPending && (<>
            <div className="text-base leading-[1.7] text-text-2 [&_p:first-child]:text-[17px] [&_p]:my-3 [&_p]:whitespace-normal">
              <RichText text={content} headingIds />
            </div>

            {lesson.keyTakeaways?.[locale] && lesson.keyTakeaways[locale].length > 0 && (
              <Card className="mt-8">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4 text-link" aria-hidden="true" />
                  {lp.keyTakeaways}
                </div>
                <ul className="flex flex-col gap-1">
                  {lesson.keyTakeaways[locale].map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint-text" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {lesson.examFocusPoints?.[locale] && lesson.examFocusPoints[locale].length > 0 && (
              <Card className="mt-4 border-warning/40 bg-warning-soft">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning-text">
                  <Target className="h-4 w-4" aria-hidden="true" />
                  {lp.examFocus}
                </div>
                <ul className="flex flex-col gap-1">
                  {lesson.examFocusPoints[locale].map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {lesson.cheatSheet?.[locale] && (
              <section className="mt-4 rounded-2xl border border-accent-border bg-accent-soft p-5" data-testid="cheat-sheet" aria-label={lp.cheatSheet}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-link" aria-hidden="true" />
                    {lp.cheatSheet}
                  </span>
                  <Link href={`/cert/${certSlug}/cheatsheets`} className="text-xs font-normal text-link hover:underline">
                    {lp.allCheatSheets}
                  </Link>
                </div>
                <div className="text-sm text-text-2">
                  <RichText text={lesson.cheatSheet[locale]} />
                </div>
              </section>
            )}
            </>)}

            <div className="mt-8">
              {!quizEnabled ? (
                <div className="flex flex-col gap-3" data-testid="lesson-complete">
                  {!signedIn ? (
                    <p className="text-sm text-subtle">{lp.signInToComplete}</p>
                  ) : completed ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-mint-text" role="status">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {lp.lessonCompleted}
                    </p>
                  ) : (
                    <Button onClick={() => void completeLesson()} disabled={completing} className="w-fit" data-testid="lesson-complete-button">
                      {lp.completeLesson}
                    </Button>
                  )}
                  {completeError && <p role="alert" className="text-sm text-danger-text">{completeError}</p>}
                  <Link href={`/cert/${certSlug}`} className="w-fit text-sm text-link hover:underline">{lp.backToPath}</Link>
                </div>
              ) : hasQuiz ? (
                <Card variant="hero" data-testid="quiz-hero">
                  <h2 className="text-xl font-semibold">{lp.fits}</h2>
                  <p className="mt-1 text-sm text-muted">{fmt(lp.fitsBody, { n: questions.length, m: Math.max(1, Math.round(questions.length * 0.7)) })}</p>
                  <Button className="mt-4" onClick={() => setShowQuiz(true)} iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />} data-testid="start-quiz">
                    {lp.startQuiz}
                  </Button>
                </Card>
              ) : null}
              {showQuiz && hasQuiz && (
                <SectionQuiz
                  sectionId={sectionId}
                  questions={questions}
                  certSlug={certSlug}
                  locale={locale}
                  contextLabel={`${domainName} · ${objectiveCode} ${objectiveTitle}`}
                  objectiveLabel={objectiveCode}
                  offline={offline}
                  exitEnabled={exitEnabled}
                  askConfidence={askConfidence}
                />
              )}
            </div>

            {outline && (outline.prevId || outline.nextId) && (
              <nav className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border pt-4" aria-label={lp.outline}>
                {outline.prevId ? (
                  <Button asChild variant="secondary"><Link href={`/cert/${certSlug}/section/${outline.prevId}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{lp.prev}</Link></Button>
                ) : <span />}
                {outline.nextId && (
                  <Button asChild variant="secondary"><Link href={`/cert/${certSlug}/section/${outline.nextId}`}>{lp.next}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
                )}
              </nav>
            )}
          </article>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-6 flex flex-col gap-5">
            <TocList entries={toc} />
            {lessonId && !offline && (
              <Card variant="inset">
                <p className="text-xs font-semibold">{lp.source}</p>
                <p className="mt-1 text-xs text-subtle">{lp.sourceNote}</p>
                <div className="mt-2"><ReportProblem lessonId={lessonId} label={lp.reportContent} /></div>
              </Card>
            )}
          </div>
        </aside>
      </div>
    </div>
    </LessonSimulationsProvider>
  );
}
