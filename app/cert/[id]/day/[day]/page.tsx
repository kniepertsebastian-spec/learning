"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import confetti from "canvas-confetti";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useModuleByDay } from "@/lib/hooks/queries";
import { markModuleCompleted, saveModuleContent } from "@/lib/hooks/mutations";
import { chapterResponseSchema } from "@/lib/ai/schemas";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import type { QuizQuestion } from "@/lib/types";
import "highlight.js/styles/github-dark.min.css";

const PASS_THRESHOLD = 0.8;

export default function LessonPage() {
  const { id, day } = useParams<{ id: string; day: string }>();
  const dayNumber = Number(day);
  const { locale, t } = useLocale();
  const data = useModuleByDay(id, dayNumber);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [hasMarkedRead, setHasMarkedRead] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);

  const mod = data?.module;
  const certificate = data?.certificate;
  const quiz = data?.quiz;
  const hasContent = mod ? mod.contentMarkdown[locale].length > 0 : false;

  useEffect(() => {
    if (!mod || !certificate || hasContent || isGenerating) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsGenerating(true);
    setGenerationError(null);

    fetch("/api/generate/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        certName: certificate.title,
        day: mod.day,
        moduleTitle: mod.title,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? t.lesson.loadError);
        }
        const data = chapterResponseSchema.parse(await response.json());
        const questions: QuizQuestion[] = data.questions.map((q) => ({
          id: crypto.randomUUID(),
          ...q,
        }));
        await saveModuleContent(mod.id, data.contentMarkdown, { questions });
      })
      .catch(() => setGenerationError(t.lesson.loadError))
      .finally(() => setIsGenerating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod?.id, hasContent, certificate?.id]);

  if (data === undefined) return null;
  if (!mod || !certificate) {
    return <p className="text-foreground/70">{t.certDetail.notFound}</p>;
  }
  const activeModule = mod;

  function handleAnswered(isCorrect: boolean) {
    if (isCorrect) setCorrectCount((c) => c + 1);
    setHasAnsweredCurrent(true);
  }

  async function handleNextQuestion() {
    if (!quiz) return;
    if (quizIndex + 1 >= quiz.questions.length) {
      const score = Math.round((correctCount / quiz.questions.length) * 100);
      await markModuleCompleted(activeModule.id, score);
      setQuizFinished(true);
      if (correctCount / quiz.questions.length >= PASS_THRESHOLD) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    } else {
      setQuizIndex((i) => i + 1);
      setHasAnsweredCurrent(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          href={`/cert/${id}`}
          className="mb-1 flex w-fit items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t.lesson.backToCert}
        </Link>
        <h1 className="font-semibold">
          {t.certDetail.dayLabel} {activeModule.day} - {activeModule.title[locale]}
        </h1>
      </div>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
          {generationError ? (
            <p className="text-red-500">{generationError}</p>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
              <p className="font-medium">{t.lesson.generating}</p>
            </>
          )}
        </div>
      ) : (
        <>
          <article className="prose dark:prose-invert mb-8 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {activeModule.contentMarkdown[locale]}
            </ReactMarkdown>
          </article>

          {!hasMarkedRead ? (
            <button
              type="button"
              onClick={() => setHasMarkedRead(true)}
              className="mb-8 flex w-fit items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t.lesson.markRead}
            </button>
          ) : quiz && quiz.questions.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold">{t.lesson.quizTitle}</h2>

              {quizFinished ? (
                <div className="rounded-lg border border-border bg-surface p-6 text-center">
                  <p className="mb-1 text-lg font-semibold">{t.lesson.quizComplete}</p>
                  <p className="mb-4 text-foreground/70">
                    {t.lesson.score}: {correctCount}/{quiz.questions.length}
                  </p>
                  <Link
                    href={`/cert/${id}`}
                    className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    {t.lesson.backToCert}
                  </Link>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-sm text-foreground/60">
                    {quizIndex + 1} / {quiz.questions.length}
                  </p>
                  <QuizQuestionCard
                    key={quiz.questions[quizIndex].id}
                    question={quiz.questions[quizIndex]}
                    onAnswered={handleAnswered}
                  />
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    disabled={!hasAnsweredCurrent}
                    className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {quizIndex + 1 >= quiz.questions.length
                      ? t.lesson.finishQuiz
                      : t.lesson.nextQuestion}
                  </button>
                </>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
