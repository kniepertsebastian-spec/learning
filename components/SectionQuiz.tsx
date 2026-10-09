"use client";

import { useState } from "react";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { SegmentState } from "@/components/ui/progress";
import type { AnswerConfidence, QuizQuestion, Locale } from "@/lib/types";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";

export interface SectionQuizQuestion {
  id: string;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{
    id: string;
    text: { de: string; en: string };
    orderNum: number;
    isCorrect: boolean;
    /** UI U4: warum diese (falsche) Option nicht passt; fehlt bei älteren Fragen. */
    rationale?: { de: string; en: string } | null;
  }>;
  difficulty?: string | null;
  /** R1.4: knappe Quellenangabe (z. B. "S. 4"), falls die Frage
   * quellengebunden generiert wurde - sonst null. */
  sourceReference: string | null;
}

interface SectionQuizProps {
  sectionId: string;
  questions: SectionQuizQuestion[];
  certSlug: string;
  locale: Locale;
  /** Kontext für die Fokusleiste, z. B. „Domain 3 · 3.2 Troubleshooting“. */
  contextLabel?: string;
  objectiveLabel?: string;
  /** R4.1/4.2/4.3 (roadmap.md): im Offline-Reader gesetzt - statt des
   * direkten POST an den Server wird das Ergebnis in die lokale Sync-
   * Warteschlange (lib/client/sync-queue.ts) eingereiht und beim nächsten
   * `online`/App-Start/manuellen Sync übertragen. */
  offline?: { userId: string };
}

export function SectionQuiz({ sectionId, questions, certSlug, locale, contextLabel, objectiveLabel, offline }: SectionQuizProps) {
  const { t } = useLocale();
  const [quizIndex, setQuizIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<{
    questionId: string;
    selectedOptionId: string;
    confidence?: AnswerConfidence;
  } | null>(null);
  const [answers, setAnswers] = useState<
    Array<{ questionId: string; selectedOptionId: string; confidence?: AnswerConfidence }>
  >([]);

  function mapQuestion(q: SectionQuizQuestion): QuizQuestion {
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    const hasRationales = sorted.some((o) => !o.isCorrect && o.rationale);
    return {
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      options: {
        de: sorted.map((o) => o.text.de),
        en: sorted.map((o) => o.text.en),
      },
      correctIndex: sorted.findIndex((o) => o.isCorrect),
      optionRationales: hasRationales
        ? { de: sorted.map((o) => o.rationale?.de ?? null), en: sorted.map((o) => o.rationale?.en ?? null) }
        : null,
    };
  }

  function handleAnswered(isCorrect: boolean, selectedIndex: number, confidence?: AnswerConfidence) {
    setResults((r) => [...r, isCorrect]);
    setHasAnsweredCurrent(true);
    const q = questions[quizIndex];
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    setPendingAnswer({
      questionId: q.id,
      selectedOptionId: sorted[selectedIndex]?.id ?? "",
      confidence,
    });
  }

  function handleNext() {
    if (!hasAnsweredCurrent) return;
    const nextAnswers = pendingAnswer ? [...answers, pendingAnswer] : answers;

    if (quizIndex + 1 >= questions.length) {
      setQuizFinished(true);
      if (offline) {
        enqueueSyncEvent(
          offline.userId,
          "section_quiz",
          { sectionId, answers: nextAnswers },
          locale === "de" ? "Abschnittsquiz" : "Section quiz",
        ).catch(() => {});
      } else {
        fetch(`/api/sections/${sectionId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: nextAnswers }),
        }).catch(() => {});
      }
    } else {
      setAnswers(nextAnswers);
      setQuizIndex((i) => i + 1);
      setHasAnsweredCurrent(false);
      setPendingAnswer(null);
    }
  }

  if (questions.length === 0) return null;

  const correctCount = results.filter(Boolean).length;
  const wrongCount = results.length - correctCount;

  if (quizFinished) {
    const score = Math.round((correctCount / questions.length) * 100);
    return (
      <FocusFrame
        exitHref={`/cert/${certSlug}`}
        confirmLeave={false}
        contextLabel={contextLabel ?? t.quiz.sectionQuiz}
        mode="practice"
        segments={results.map((r): SegmentState => (r ? "correct" : "wrong"))}
        counterText={fmt(t.quiz.correctCount, { a: correctCount, b: questions.length })}
      >
        <ResultSummary
          score={score}
          headline={fmt(t.quiz.correctCount, { a: correctCount, b: questions.length })}
          offlineNote={Boolean(offline)}
          actions={[{ href: `/cert/${certSlug}`, label: t.quiz.backToCourse, primary: true }]}
        />
      </FocusFrame>
    );
  }

  const current = questions[quizIndex];
  const segments: SegmentState[] = questions.map((_, i) => (i < results.length ? (results[i] ? "correct" : "wrong") : i === quizIndex ? "current" : "open"));

  return (
    <FocusFrame
      exitHref={`/cert/${certSlug}`}
      confirmLeave={results.length > 0}
      contextLabel={contextLabel ?? t.quiz.sectionQuiz}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: quizIndex + 1, y: questions.length })}
      scoreText={fmt(t.quiz.correctWrong, { a: correctCount, b: wrongCount })}
    >
      <QuizQuestionCard
        key={current.id}
        question={mapQuestion(current)}
        onAnswered={handleAnswered}
        sourceReference={current.sourceReference}
        askConfidence
        onNext={handleNext}
        nextLabel={quizIndex + 1 >= questions.length ? t.quiz.finish : t.quiz.next}
        objectiveLabel={objectiveLabel}
        difficulty={current.difficulty}
      />
    </FocusFrame>
  );
}
