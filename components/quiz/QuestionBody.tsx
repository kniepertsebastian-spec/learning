"use client";

import { Keyboard } from "lucide-react";
import { OptionTile, type OptionState } from "@/components/quiz/OptionTile";
import { QuestionHead } from "@/components/quiz/QuestionHead";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";

/** Kopf + Fragetext + Antwortkacheln + Tastaturhinweis; Zustände der Kacheln legt der Aufrufer fest. */
export function QuestionBody({
  question,
  options,
  states,
  onPick,
  locked,
  objectiveLabel,
  difficulty,
  flagged,
  onToggleFlag,
  showHint = true,
  optionsHidden = false,
  onShowOptions,
}: {
  question: string;
  options: string[];
  states: OptionState[];
  onPick: (index: number) => void;
  /** Nach dem Aufdecken sind die Kacheln nicht mehr klickbar. */
  locked?: boolean;
  objectiveLabel?: string;
  difficulty?: string | null;
  flagged?: boolean;
  onToggleFlag?: () => void;
  showHint?: boolean;
  /** Modus „Antwort zuerst überlegen“: Optionen sind verdeckt, bis die Person sie zeigt. */
  optionsHidden?: boolean;
  onShowOptions?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div>
      <QuestionHead objectiveLabel={objectiveLabel} difficulty={difficulty} flagged={flagged} onToggleFlag={onToggleFlag} />
      <div className="mb-5 text-xl leading-[1.4] font-semibold sm:text-2xl" data-testid="question-text">
        <RichText text={question} />
      </div>
      {optionsHidden ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-4" data-testid="options-hidden">
          <p className="mb-3 text-sm text-subtle">{t.quiz.thinkFirstHint}</p>
          <Button onClick={onShowOptions} data-testid="show-options">{t.quiz.showOptions}</Button>
        </div>
      ) : (
      <div role="radiogroup" aria-label={t.quiz.options} className="flex flex-col gap-2.5">
        {options.map((option, i) => (
          <OptionTile
            key={i}
            index={i}
            state={states[i] ?? "neutral"}
            disabled={locked}
            onClick={() => onPick(i)}
            stateLabel={states[i] === "correct" ? t.quiz.correct : states[i] === "wrong" ? t.quiz.reasonIncorrect : undefined}
          >
            <RichText text={option} inline />
          </OptionTile>
        ))}
      </div>
      )}
      {showHint && !optionsHidden && (
        <p className="mt-3 hidden items-center gap-1.5 text-xs text-faint sm:flex">
          <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
          {t.quiz.hotkeys}
        </p>
      )}
    </div>
  );
}
