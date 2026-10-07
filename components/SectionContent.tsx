"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowLeft, BookOpen, Check, Target } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { SectionQuiz } from "@/components/SectionQuiz";
import type { SectionQuizQuestion } from "@/components/SectionQuiz";
import type { Localized } from "@/lib/types";
import "highlight.js/styles/github-dark.min.css";

interface SectionContentProps {
  certSlug: string;
  sectionId: string;
  sectionTitle: Localized<string>;
  objectiveCode: string;
  objectiveTitle: string;
  domainName: string;
  lesson: {
    content: Localized<string>;
    keyTakeaways: Localized<string[]> | null;
    examFocusPoints: Localized<string[]> | null;
  };
  questions: SectionQuizQuestion[];
  /** R4.1/4.2/4.3: siehe SectionQuiz - wird im Offline-Reader gesetzt. */
  offline?: { userId: string };
  /** false: Lernpfad ohne Lektionstests; statt des Quiz gibt es „Lektion abschließen“. Standard true. */
  quizEnabled?: boolean;
  signedIn?: boolean;
  initialCompleted?: boolean;
}

export function SectionContent({
  certSlug,
  sectionId,
  sectionTitle,
  objectiveCode,
  objectiveTitle,
  domainName,
  lesson,
  questions,
  offline,
  quizEnabled = true,
  signedIn = true,
  initialCompleted = false,
}: SectionContentProps) {
  const { locale } = useLocale();
  const router = useRouter();
  const [showQuiz, setShowQuiz] = useState(false);
  const [completed, setCompleted] = useState(initialCompleted);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  async function completeLesson() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
      setCompleted(true);
      router.refresh();
    } catch {
      setCompleteError(locale === "de" ? "Das hat nicht geklappt. Bitte erneut versuchen." : "That did not work. Please try again.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          href={`/cert/${certSlug}`}
          className="mb-1 flex w-fit items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {locale === "de" ? "Zurück zum Zertifikat" : "Back to certification"}
        </Link>
        <p className="text-xs text-foreground/50">
          {domainName} · {objectiveCode}
        </p>
        <h1 className="font-semibold">{sectionTitle[locale]}</h1>
      </div>

      <article className="prose dark:prose-invert mb-8 max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {lesson.content[locale]}
        </ReactMarkdown>
      </article>

      {lesson.keyTakeaways?.[locale] && lesson.keyTakeaways[locale].length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
            {locale === "de" ? "Wichtige Erkenntnisse" : "Key takeaways"}
          </div>
          <ul className="flex flex-col gap-1">
            {lesson.keyTakeaways[locale].map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 shrink-0 text-accent">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lesson.examFocusPoints?.[locale] && lesson.examFocusPoints[locale].length > 0 && (
        <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
            <Target className="h-4 w-4" aria-hidden="true" />
            {locale === "de" ? "Prüfungsrelevant" : "Exam focus"}
          </div>
          <ul className="flex flex-col gap-1">
            {lesson.examFocusPoints[locale].map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 shrink-0 text-amber-500">→</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!quizEnabled ? (
        <div className="mb-8 flex flex-col gap-3" data-testid="lesson-complete">
          {!signedIn ? (
            <p className="text-sm text-foreground/70">
              {locale === "de" ? "Melde dich an, um diese Lektion als durchgearbeitet zu markieren." : "Sign in to mark this lesson as completed."}
            </p>
          ) : completed ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600" role="status">
              <Check className="h-4 w-4" aria-hidden="true" />
              {locale === "de" ? "Lektion durchgearbeitet" : "Lesson completed"}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void completeLesson()}
              disabled={completing}
              data-testid="lesson-complete-button"
              className="w-fit rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {locale === "de" ? "Lektion abschließen" : "Complete lesson"}
            </button>
          )}
          {completeError && <p role="alert" className="text-sm text-red-500">{completeError}</p>}
          <Link href={`/cert/${certSlug}`} className="w-fit text-sm text-accent hover:underline">
            {locale === "de" ? "Zurück zum Lernpfad" : "Back to learning path"}
          </Link>
        </div>
      ) : !showQuiz ? (
        <button
          type="button"
          onClick={() => setShowQuiz(true)}
          className="mb-8 w-fit rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Quiz starten" : "Start quiz"}
        </button>
      ) : (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            {locale === "de" ? "Abschnittsquiz" : "Section quiz"}
          </h2>
          <SectionQuiz
            sectionId={sectionId}
            questions={questions}
            certSlug={certSlug}
            locale={locale}
            offline={offline}
          />
        </section>
      )}
    </div>
  );
}
