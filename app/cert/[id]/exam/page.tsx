"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Flag, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useCertificateDetail } from "@/lib/hooks/queries";
import { saveExamResult } from "@/lib/hooks/mutations";
import { mockExamResponseSchema } from "@/lib/ai/schemas";
import { ExamTimer } from "@/components/ExamTimer";
import { ExamNavigator } from "@/components/ExamNavigator";
import type { QuizQuestion } from "@/lib/types";

const QUESTIONS_PER_EXAM_DEFAULT = 50;
const MINUTES_PER_50_QUESTIONS = 90;
const MIN_DURATION_SECONDS = 10 * 60;
const PASSING_SCORE = 75;

type ExamPhase = "setup" | "loading" | "error" | "in-progress" | "finished";

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const detail = useCertificateDetail(id);

  const [phase, setPhase] = useState<ExamPhase>("setup");
  const [questionCount, setQuestionCount] = useState(QUESTIONS_PER_EXAM_DEFAULT);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  const incorrectQuestions = useMemo(
    () => questions.filter((q, i) => answers[i] !== q.correctIndex),
    [questions, answers],
  );

  if (detail === undefined) return null;
  const { certificate } = detail;
  if (!certificate) {
    return <p className="text-foreground/70">{t.certDetail.notFound}</p>;
  }

  async function startExam() {
    setPhase("loading");
    try {
      const response = await fetch("/api/generate/mock-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certName: certificate!.title, questionCount }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? t.exam.loadError);
      }
      const data = mockExamResponseSchema.parse(await response.json());
      const loaded: QuizQuestion[] = data.questions.map((q) => ({
        id: crypto.randomUUID(),
        ...q,
      }));

      const duration = Math.max(
        MIN_DURATION_SECONDS,
        Math.round((loaded.length / QUESTIONS_PER_EXAM_DEFAULT) * MINUTES_PER_50_QUESTIONS * 60),
      );

      setQuestions(loaded);
      setAnswers(new Array(loaded.length).fill(null));
      setFlagged(new Set());
      setCurrentIndex(0);
      setTotalSeconds(duration);
      setSecondsLeft(duration);
      setPhase("in-progress");
    } catch {
      setPhase("error");
    }
  }

  function toggleFlag(index: number) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAnswer(optionIndex: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = optionIndex;
      return next;
    });
  }

  async function finishExam() {
    const correctCount = questions.reduce(
      (sum, q, i) => sum + (answers[i] === q.correctIndex ? 1 : 0),
      0,
    );
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= PASSING_SCORE;
    const durationSeconds = totalSeconds - secondsLeft;

    await saveExamResult(certificate!.id, { questions, score, passed, durationSeconds });
    setResult({ score, passed });
    setPhase("finished");
  }

  function handleSubmitClick() {
    if (window.confirm(t.exam.confirmSubmit)) {
      void finishExam();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${id}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.certDetail.back}
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">{t.exam.title}</h1>

      {phase === "setup" && (
        <div className="max-w-sm rounded-lg border border-border bg-surface p-6">
          <label htmlFor="questionCount" className="mb-1 block text-sm font-medium">
            {t.exam.questionCountLabel}
          </label>
          <input
            id="questionCount"
            type="number"
            min={5}
            max={100}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={startExam}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {t.exam.start}
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
          <p className="font-medium">{t.exam.generating}</p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-1 flex-col items-center gap-4 py-20 text-center">
          <p className="text-red-500">{t.exam.loadError}</p>
          <button
            type="button"
            onClick={() => setPhase("setup")}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
          >
            {t.common.retry}
          </button>
        </div>
      )}

      {phase === "in-progress" && questions.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-foreground/60">
                {t.exam.question} {currentIndex + 1} / {questions.length}
              </p>
              <ExamTimer
                secondsLeft={secondsLeft}
                onTick={setSecondsLeft}
                onExpire={() => void finishExam()}
              />
            </div>

            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <p className="font-medium">{questions[currentIndex].question[locale]}</p>
                <button
                  type="button"
                  onClick={() => toggleFlag(currentIndex)}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-background"
                >
                  <Flag
                    className={`h-3.5 w-3.5 ${flagged.has(currentIndex) ? "fill-amber-500 text-amber-500" : ""}`}
                    aria-hidden="true"
                  />
                  {flagged.has(currentIndex) ? t.exam.unflag : t.exam.flag}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {questions[currentIndex].options[locale].map((option, optionIndex) => (
                  <button
                    key={optionIndex}
                    type="button"
                    onClick={() => selectAnswer(optionIndex)}
                    className={`rounded-md border px-3 py-2.5 text-left text-sm ${
                      answers[currentIndex] === optionIndex
                        ? "border-accent bg-accent/10"
                        : "border-border hover:bg-background"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.exam.previous}
              </button>

              {currentIndex + 1 < questions.length ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => i + 1)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
                >
                  {t.exam.next}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  {t.exam.submitExam}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <ExamNavigator
              total={questions.length}
              currentIndex={currentIndex}
              answers={answers}
              flagged={flagged}
              onJump={setCurrentIndex}
            />
            <button
              type="button"
              onClick={handleSubmitClick}
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface"
            >
              {t.exam.submitExam}
            </button>
          </div>
        </div>
      )}

      {phase === "finished" && result && (
        <div>
          <div className="mb-6 rounded-lg border border-border bg-surface p-6 text-center">
            <p className="mb-1 text-sm uppercase tracking-wide text-foreground/60">
              {t.exam.results}
            </p>
            <p
              className={`mb-2 text-3xl font-bold ${result.passed ? "text-emerald-500" : "text-red-500"}`}
            >
              {result.score}%
            </p>
            <p className="mb-1 font-medium">{result.passed ? t.exam.passed : t.exam.failed}</p>
            <p className="text-sm text-foreground/60">
              {t.exam.passingScore}: {PASSING_SCORE}%
            </p>
          </div>

          {incorrectQuestions.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">{t.exam.weakAreas}</h2>
              <div className="flex flex-col gap-3">
                {incorrectQuestions.map((q) => (
                  <div key={q.id} className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-1 font-medium">{q.question[locale]}</p>
                    <p className="text-sm text-foreground/70">{q.explanation[locale]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            href={`/cert/${id}`}
            className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t.certDetail.back}
          </Link>
        </div>
      )}
    </div>
  );
}
