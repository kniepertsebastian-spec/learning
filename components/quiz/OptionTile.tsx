import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { letterOf } from "@/lib/quiz/keys";

export type OptionState = "neutral" | "selected" | "correct" | "wrong" | "dimmed";

const TILE: Record<OptionState, string> = {
  neutral: "border-border-strong bg-surface hover:border-subtle",
  selected: "border-info bg-info-soft",
  correct: "border-mint bg-mint-soft",
  wrong: "border-danger bg-danger-soft",
  dimmed: "border-border-subtle bg-surface-inset text-faint",
};
const BADGE: Record<OptionState, string> = {
  neutral: "bg-control text-muted",
  selected: "bg-info text-on-accent",
  correct: "bg-mint text-on-accent",
  wrong: "bg-danger text-on-accent",
  dimmed: "bg-control text-faint opacity-70",
};

/** Antwortkachel (min. 60 px, Radius 14, Buchstaben-Badge). Richtig/falsch nie nur über Farbe: Icon und Screenreader-Text dazu. */
export function OptionTile({
  index,
  state,
  onClick,
  disabled,
  children,
  stateLabel,
}: {
  index: number;
  state: OptionState;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  /** Text für Screenreader bei richtig/falsch */
  stateLabel?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state === "selected" || state === "correct" || state === "wrong"}
      onClick={onClick}
      disabled={disabled}
      data-state={state}
      data-testid={`option-${index}`}
      className={cn("flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] border px-4 py-3 text-left text-[15px] transition-colors disabled:cursor-default", TILE[state])}
    >
      <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold", BADGE[state])} aria-hidden="true">
        {letterOf(index)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {state === "correct" && <Check className="h-5 w-5 shrink-0 text-mint-text" aria-hidden="true" />}
      {state === "wrong" && <X className="h-5 w-5 shrink-0 text-danger-text" aria-hidden="true" />}
      {stateLabel && (state === "correct" || state === "wrong") && <span className="sr-only">{stateLabel}</span>}
    </button>
  );
}
