"use client";

import { useState } from "react";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import type { SegmentState } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
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
  options: Array<{ text: { de: string; en: string }; isCorrect: boolean; rationale?: { de: string; en: string } | null }>;
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
  const { t } = useLocale();
  const [results, setResults] = useState<boolean[]>([]);
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
      optionRationales: q.options.some((o) => !o.isCorrect && o.rationale)
        ? { de: q.options.map((o) => o.rationale?.de ?? null), en: q.options.map((o) => o.rationale?.en ?? null) }
        : null,
    };
  }

  function handleAnswered(isCorrect: boolean, selectedIndex: number) {
    if (isCorrect) setCorrectCount((c) => c + 1);
    setResults((r) => [...r, isCorrect]);
    setHasAnsweredCurrent(true);
    setPendingAnswer(selectedIndex);
  }

  async function handleNext() {
    if (!hasAnsweredCurrent || submitting) return;
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

  const exitHref = `/cert/${certSlug}`;

  if (phase === "lesson") {
    return (
      <Card className="max-w-[760px]">
        <h2 className="mb-3 text-lg font-semibold">{lesson.title[locale]}</h2>
        <p className="mb-4 text-body leading-[1.65] whitespace-pre-wrap text-muted">{lesson.explanation[locale]}</p>

        {lesson.keyPoints[locale]?.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">{locale === "de" ? "Kernpunkte" : "Key points"}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {lesson.keyPoints[locale].map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {lesson.commonMisconceptions[locale]?.length > 0 && (
          <Callout tone="mistake" title={locale === "de" ? "Häufige Missverständnisse" : "Common misconceptions"} className="mb-4">
            <ul className="list-disc space-y-1 pl-5">
              {lesson.commonMisconceptions[locale].map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </Callout>
        )}

        <Button onClick={() => setPhase("quiz")}>{locale === "de" ? "Übungsfragen starten" : "Start practice questions"}</Button>
      </Card>
    );
  }

  const contextLabel = `${t.quiz.remediation} · ${lesson.title[locale]}`;

  if (phase === "result" && result) {
    return (
      <FocusFrame
        exitHref={exitHref}
        confirmLeave={false}
        contextLabel={contextLabel}
        mode="practice"
        segments={results.map((r): SegmentState => (r ? "correct" : "wrong"))}
        counterText={fmt(t.quiz.correctCount, { a: correctCount, b: questions.length })}
      >
        <ResultSummary
          score={result.score}
          headline={fmt(t.quiz.correctCount, { a: correctCount, b: questions.length })}
          subline={
            result.improved
              ? locale === "de" ? "Verbesserung erkannt." : "Improvement detected."
              : locale === "de" ? "Noch keine deutliche Verbesserung – eventuell nochmal wiederholen." : "No clear improvement yet – consider reviewing again."
          }
          actions={[{ href: exitHref, label: t.quiz.backToCourse, primary: true }]}
        />
      </FocusFrame>
    );
  }

  const segments: SegmentState[] = questions.map((_, i) => (i < results.length ? (results[i] ? "correct" : "wrong") : i === quizIndex ? "current" : "open"));

  return (
    <FocusFrame
      exitHref={exitHref}
      confirmLeave={results.length > 0}
      contextLabel={contextLabel}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: quizIndex + 1, y: questions.length })}
      scoreText={fmt(t.quiz.correctWrong, { a: correctCount, b: results.length - correctCount })}
    >
      <QuizQuestionCard
        key={quizIndex}
        question={mapQuestion(questions[quizIndex])}
        onAnswered={handleAnswered}
        onNext={() => void handleNext()}
        nextLabel={submitting ? t.quiz.submitting : quizIndex + 1 >= questions.length ? t.quiz.finish : t.quiz.next}
        nextDisabled={submitting}
        difficulty={questions[quizIndex].difficulty}
      />
    </FocusFrame>
  );
}
