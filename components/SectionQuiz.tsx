"use client";

import { useState } from "react";
import Link from "next/link";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import type { QuizQuestion, Locale } from "@/lib/types";

export interface SectionQuizQuestion {
  id: string;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{
    id: string;
    text: { de: string; en: string };
    orderNum: number;
    isCorrect: boolean;
  }>;
}

interface SectionQuizProps {
  sectionId: string;
  questions: SectionQuizQuestion[];
  certSlug: string;
  locale: Locale;
}

export function SectionQuiz({ sectionId, questions, certSlug, locale }: SectionQuizProps) {
  const [quizIndex, setQuizIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{
    questionId: string;
    selectedOptionId: string;
  } | null>(null);
  const [answers, setAnswers] = useState<Array<{ questionId: string; selectedOptionId: string }>>(
    [],
  );

  function mapQuestion(q: SectionQuizQuestion): QuizQuestion {
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    return {
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      options: {
        de: sorted.map((o) => o.text.de),
        en: sorted.map((o) => o.text.en),
      },
      correctIndex: sorted.findIndex((o) => o.isCorrect),
    };
  }

  function handleAnswered(isCorrect: boolean, selectedIndex: number) {
    if (isCorrect) setCorrectCount((c) => c + 1);
    setHasAnsweredCurrent(true);
    const q = questions[quizIndex];
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    setPendingAnswer({
      questionId: q.id,
      selectedOptionId: sorted[selectedIndex]?.id ?? "",
    });
  }

  async function handleNext() {
    const nextAnswers = pendingAnswer ? [...answers, pendingAnswer] : answers;

    if (quizIndex + 1 >= questions.length) {
      setQuizFinished(true);
      const score = Math.round(((correctCount + (pendingAnswer ? 0 : 0)) / questions.length) * 100);
      setFinalScore(score);
      fetch(`/api/sections/${sectionId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: nextAnswers }),
      }).catch(() => {});
    } else {
      setAnswers(nextAnswers);
      setQuizIndex((i) => i + 1);
      setHasAnsweredCurrent(false);
      setPendingAnswer(null);
    }
  }

  if (questions.length === 0) return null;

  if (quizFinished) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="mb-1 text-3xl font-bold">{finalScore}%</p>
        <p className="mb-6 text-foreground/70">
          {correctCount} / {questions.length} correct
        </p>
        <Link
          href={`/cert/${certSlug}`}
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Back to certification
        </Link>
      </div>
    );
  }

  const mapped = mapQuestion(questions[quizIndex]);

  return (
    <div>
      <p className="mb-3 text-sm text-foreground/60">
        {locale === "de" ? "Frage" : "Question"} {quizIndex + 1} / {questions.length}
      </p>
      <QuizQuestionCard
        key={questions[quizIndex].id}
        question={mapped}
        onAnswered={handleAnswered}
      />
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasAnsweredCurrent}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {quizIndex + 1 >= questions.length
          ? locale === "de"
            ? "Quiz abschließen"
            : "Finish quiz"
          : locale === "de"
            ? "Nächste Frage"
            : "Next question"}
      </button>
    </div>
  );
}
