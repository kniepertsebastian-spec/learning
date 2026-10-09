"use client";

import { useState } from "react";
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar";
import { FeedbackPanel } from "@/components/quiz/FeedbackPanel";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { useQuizHotkeys } from "@/components/quiz/useQuizHotkeys";
import { useLocale } from "@/lib/i18n";
import type { AnswerConfidence, QuizQuestion } from "@/lib/types";

interface QuizQuestionCardProps {
  question: QuizQuestion;
  onAnswered: (isCorrect: boolean, selectedIndex: number, confidence?: AnswerConfidence) => void;
  /** R1.4: knappe Quellenangabe (z. B. "S. 4"); die vollständige Angabe bleibt dem Adminbereich vorbehalten. */
  sourceReference?: string | null;
  /** R2: Selbsteinschätzung VOR der Aufdeckung erfassen, sonst wäre sie keine echte Selbsteinschätzung mehr. */
  askConfidence?: boolean;
  /** „Nächste Frage“ im Feedback-Panel (Enter löst es ebenfalls aus). */
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  objectiveLabel?: string;
  difficulty?: string | null;
}

/** Eine Frage im Übungsmodus: wählen, (Selbsteinschätzung), aufdecken, Feedback. Bedienbar nur mit Tastatur (A–D, Enter). */
export function QuizQuestionCard({
  question,
  onAnswered,
  sourceReference,
  askConfidence = false,
  onNext,
  nextLabel,
  nextDisabled,
  objectiveLabel,
  difficulty,
}: QuizQuestionCardProps) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<AnswerConfidence | null>(null);

  const revealed = askConfidence ? confidence !== null : selected !== null;
  const options = question.options[locale];

  function pick(index: number) {
    if (selected !== null) return;
    setSelected(index);
    if (!askConfidence) onAnswered(index === question.correctIndex, index);
  }

  function pickConfidence(level: AnswerConfidence) {
    if (selected === null || confidence !== null) return;
    setConfidence(level);
    onAnswered(selected === question.correctIndex, selected, level);
  }

  useQuizHotkeys(options.length, (action) => {
    if (action.type === "pick") pick(action.index);
    else if (action.type === "enter" && revealed && onNext && !nextDisabled) onNext();
  });

  const states: OptionState[] = options.map((_, i) => {
    if (!revealed) return i === selected ? "selected" : "neutral";
    if (i === question.correctIndex) return "correct";
    if (i === selected) return "wrong";
    return "dimmed";
  });

  return (
    <div className="flex flex-col gap-4">
      <QuestionBody
        question={question.question[locale]}
        options={options}
        states={states}
        onPick={pick}
        locked={selected !== null}
        objectiveLabel={objectiveLabel}
        difficulty={difficulty}
      />

      {askConfidence && selected !== null && confidence === null && <ConfidenceBar onPick={pickConfidence} />}

      {revealed && selected !== null && (
        <FeedbackPanel
          correct={selected === question.correctIndex}
          correctIndex={question.correctIndex}
          explanation={question.explanation[locale]}
          rationales={question.optionRationales?.[locale]}
          options={options}
          selectedIndex={selected}
          confidence={confidence}
          sourceReference={sourceReference}
          questionId={question.id}
          nextLabel={nextLabel ?? t.quiz.next}
          onNext={onNext ?? (() => {})}
          nextDisabled={nextDisabled || !onNext}
        />
      )}
    </div>
  );
}
