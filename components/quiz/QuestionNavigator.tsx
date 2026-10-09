"use client";

import { Info } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export type NavState = "open" | "answered" | "correct" | "wrong";

/**
 * Fragenübersicht: Raster mit 5 Spalten, Kacheln 40 px. Übungsmodus zeigt offen/richtig/falsch, Prüfungsmodus nur
 * beantwortet/offen/markiert (keine Richtig-Farben, kein Hinweis auf Ergebnisse).
 */
export function QuestionNavigator({
  mode,
  states,
  currentIndex,
  flagged,
  onJump,
  hideNote = false,
}: {
  mode: "practice" | "exam";
  states: NavState[];
  currentIndex: number;
  flagged: ReadonlySet<number>;
  onJump: (index: number) => void;
  /** Hinweiskarte „kein Sofort-Feedback“ ausblenden (z. B. in der Tagessitzung, die nicht als Prüfung gilt). */
  hideNote?: boolean;
}) {
  const { t } = useLocale();
  const legend: Array<[string, string]> =
    mode === "exam"
      ? [
          ["bg-surface-2 border-border-strong", t.quiz.legendOpen],
          ["bg-info-soft border-info", t.quiz.legendAnswered],
        ]
      : [
          ["bg-surface-2 border-border-strong", t.quiz.legendOpen],
          ["bg-mint-soft border-mint", t.quiz.legendCorrect],
          ["bg-danger-soft border-danger", t.quiz.legendWrong],
        ];
  return (
    <div data-testid="question-navigator">
      <p className="mb-3 text-sm font-semibold">{t.quiz.navigator}</p>
      <ol className="grid grid-cols-5 gap-2">
        {states.map((state, i) => {
          const isFlagged = flagged.has(i);
          const isCurrent = i === currentIndex;
          const stateText = state === "open" ? t.quiz.legendOpen : state === "answered" ? t.quiz.legendAnswered : state === "correct" ? t.quiz.legendCorrect : t.quiz.legendWrong;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${i + 1}: ${stateText}${isFlagged ? `, ${t.quiz.flagged}` : ""}`}
                data-state={state}
                data-flagged={isFlagged}
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-lg border text-sm font-medium tabular-nums",
                  state === "open" && "border-border-strong bg-surface-2 text-muted",
                  state === "answered" && "border-info bg-info-soft text-foreground",
                  state === "correct" && "border-mint bg-mint-soft text-foreground",
                  state === "wrong" && "border-danger bg-danger-soft text-foreground",
                  isFlagged && "border-2 border-warning",
                  isCurrent && "border-2 border-foreground",
                )}
              >
                {i + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-subtle">
        {legend.map(([cls, label]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded border", cls)} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-warning" aria-hidden="true" />
          {t.quiz.legendFlagged}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-foreground" aria-hidden="true" />
          {t.quiz.legendCurrent}
        </li>
      </ul>
      {mode === "exam" && !hideNote && (
        <p className="mt-4 flex gap-2 rounded-xl border border-border bg-surface-inset p-3 text-xs text-subtle">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.quiz.examNoFeedback}
        </p>
      )}
    </div>
  );
}
