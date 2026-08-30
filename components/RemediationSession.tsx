"use client";

import { useState } from "react";
import Link from "next/link";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import type { QuizQuestion, Locale } from "@/lib/types";

interface RemediationLesson {
  title: { de: string; en: string };
  explanation: { de: string; en: string };
  keyPoints: { de: string[]; en: string[] };
  commonMisconceptions: { de: string[]; en: string[] };
}

interface RemediationQuestion {
  difficulty: string;
  type: string;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{ text: { de: string; en: string }; isCorrect: boolean }>;
}

interface RemediationSessionProps {
  certSlug: string;
  objectiveId: string;
  sessionId: string;
  lesson: RemediationLesson;
  questions: RemediationQuestion[];
  locale: Locale;
}

export function RemediationSession({
  certSlug,
  objectiveId,
  sessionId,
  lesson,
  questions,
  locale,
}: RemediationSessionProps) {
  const [phase, setPhase] = useState<"lesson" | "quiz" | "result">("lesson");
  const [quizIndex, setQuizIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Array<{ questionIndex: number; selectedOptionIndex: number }>>(
    [],
  );
  const [result, setResult] = useState<{ score: number; improved: boolean; previousScore: number } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  function mapQuestion(q: RemediationQuestion): QuizQuestion {
    return {
      id: `q-${questions.indexOf(q)}`,
      question: q.question,
      explanation: q.explanation,
      options: {
        de: q.options.map((o) => o.text.de),
        en: q.options.map((o) => o.text.en),
      },
      correctIndex: q.options.findIndex((o) => o.isCorrect),
    };
  }

  function handleAnswered(isCorrect: boolean, selectedIndex: number) {
    if (isCorrect) setCorrectCount((c) => c + 1);
    setHasAnsweredCurrent(true);
    setPendingAnswer(selectedIndex);
  }

  async function handleNext() {
    const answerRecord = { questionIndex: quizIndex, selectedOptionIndex: pendingAnswer ?? -1 };
    const nextAnswers = [...answers, answerRecord];

    if (quizIndex + 1 >= questions.length) {
      setSubmitting(true);
      try {
        const response = await fetch(`/api/remediation/${objectiveId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, answers: nextAnswers }),
        });
        const data = await response.json();
        setResult({
          score: data.score ?? 0,
          improved: data.improved ?? false,
          previousScore: data.previousScore ?? 0,
        });
      } catch {
        setResult({ score: 0, improved: false, previousScore: 0 });
      } finally {
        setSubmitting(false);
        setPhase("result");
      }
    } else {
      setAnswers(nextAnswers);
      setQuizIndex((i) => i + 1);
      setHasAnsweredCurrent(false);
      setPendingAnswer(null);
    }
  }

  if (phase === "lesson") {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold">{lesson.title[locale]}</h2>
        <p className="mb-4 whitespace-pre-wrap text-sm text-foreground/80">
          {lesson.explanation[locale]}
        </p>

        {lesson.keyPoints[locale]?.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-medium">
              {locale === "de" ? "Kernpunkte" : "Key points"}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/70">
              {lesson.keyPoints[locale].map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {lesson.commonMisconceptions[locale]?.length > 0 && (
          <div className="mb-4 rounded-md bg-yellow-50 p-3">
            <p className="mb-1 text-sm font-medium text-yellow-800">
              {locale === "de" ? "Häufige Missverständnisse" : "Common misconceptions"}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-yellow-700">
              {lesson.commonMisconceptions[locale].map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPhase("quiz")}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Übungsfragen starten" : "Start practice questions"}
        </button>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="mb-1 text-3xl font-bold">{result.score}%</p>
        <p className="mb-4 text-foreground/70">
          {correctCount} / {questions.length} {locale === "de" ? "richtig" : "correct"}
        </p>
        <p
          className={`mb-6 text-sm font-medium ${result.improved ? "text-emerald-600" : "text-foreground/60"}`}
        >
          {result.improved
            ? locale === "de"
              ? "Verbesserung erkannt! 🎉"
              : "Improvement detected! 🎉"
            : locale === "de"
              ? "Noch keine deutliche Verbesserung - eventuell nochmal wiederholen."
              : "No clear improvement yet - consider reviewing again."}
        </p>
        <Link
          href={`/cert/${certSlug}`}
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
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
      <QuizQuestionCard key={quizIndex} question={mapped} onAnswered={handleAnswered} />
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasAnsweredCurrent || submitting}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? locale === "de"
            ? "Wird ausgewertet..."
            : "Evaluating..."
          : quizIndex + 1 >= questions.length
            ? locale === "de"
              ? "Abschließen"
              : "Finish"
            : locale === "de"
              ? "Nächste Frage"
              : "Next question"}
      </button>
    </div>
  );
}
