"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowLeft, BookOpen, Target } from "lucide-react";
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
}: SectionContentProps) {
  const { locale } = useLocale();
  const [showQuiz, setShowQuiz] = useState(false);

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

      {!showQuiz ? (
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
          />
        </section>
      )}
    </div>
  );
}
