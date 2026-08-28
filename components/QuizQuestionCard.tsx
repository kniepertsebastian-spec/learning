"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import type { QuizQuestion } from "@/lib/types";

interface QuizQuestionCardProps {
  question: QuizQuestion;
  onAnswered: (isCorrect: boolean) => void;
}

export function QuizQuestionCard({ question, onAnswered }: QuizQuestionCardProps) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    onAnswered(index === question.correctIndex);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="mb-4 font-medium">{question.question[locale]}</p>

      <div className="flex flex-col gap-2">
        {question.options[locale].map((option, index) => {
          const isSelected = selected === index;
          const isCorrectOption = index === question.correctIndex;
          const showState = selected !== null;

          let stateClasses = "border-border hover:bg-background";
          if (showState && isCorrectOption) {
            stateClasses = "border-emerald-500 bg-emerald-500/10";
          } else if (showState && isSelected && !isCorrectOption) {
            stateClasses = "border-red-500 bg-red-500/10";
          }

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={selected !== null}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${stateClasses}`}
            >
              <span>{option}</span>
              {showState && isCorrectOption && (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              )}
              {showState && isSelected && !isCorrectOption && (
                <X className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className="mt-4 rounded-md bg-background p-3 text-sm">
          <p className="mb-1 font-medium">
            {selected === question.correctIndex ? t.lesson.correct : t.lesson.incorrect}
          </p>
          <p className="text-foreground/70">{question.explanation[locale]}</p>
        </div>
      )}
    </div>
  );
}
