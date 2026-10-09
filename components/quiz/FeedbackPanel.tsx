"use client";

import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import { RichText } from "@/components/RichText";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { Button } from "@/components/ui/button";
import { fmt, letterOf } from "@/lib/quiz/keys";
import { useLocale } from "@/lib/i18n";
import type { AnswerConfidence } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Feedback nach dem Aufdecken: Ergebnis, Erklärung, „Warum die anderen nicht passen“ (nur wenn Begründungen vorhanden sind),
 * Quelle, Meldung und „Nächste Frage“.
 */
export function FeedbackPanel({
  correct,
  correctIndex,
  explanation,
  rationales,
  options,
  selectedIndex,
  confidence,
  sourceReference,
  questionId,
  nextLabel,
  onNext,
  nextDisabled,
}: {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  /** Begründung je Option (Index wie die Optionen), `null` bei der richtigen und bei fehlenden. */
  rationales?: Array<string | null>;
  options: string[];
  selectedIndex: number;
  confidence?: AnswerConfidence | null;
  sourceReference?: string | null;
  questionId: string;
  nextLabel: string;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  const { t } = useLocale();
  const wrongWithReason = (rationales ?? []).flatMap((r, i) => (r && i !== correctIndex ? [[i, r] as const] : []));
  const confidenceLabel = confidence ? t.quiz[confidence] : null;

  return (
    <div
      className={cn("anim-fade-in rounded-2xl border p-5", correct ? "border-mint bg-mint-soft" : "border-danger bg-danger-soft")}
      role="status"
      aria-live="polite"
      data-testid="feedback-panel"
      data-correct={correct}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("flex items-center gap-2 text-base font-semibold", correct ? "text-mint-text" : "text-danger-text")}>
          {correct ? <CircleCheck className="h-5 w-5" aria-hidden="true" /> : <CircleX className="h-5 w-5" aria-hidden="true" />}
          {correct ? t.quiz.correct : fmt(t.quiz.notQuite, { letter: letterOf(correctIndex) })}
        </p>
        {confidenceLabel && <p className="text-xs text-subtle">{fmt(t.quiz.yourConfidence, { c: confidenceLabel })}</p>}
      </div>

      <div className="mt-3 text-[15px] leading-[1.65] text-foreground">
        <RichText text={explanation} />
      </div>

      {wrongWithReason.length > 0 && (
        <div className="mt-4 border-t border-border pt-4" data-testid="option-rationales">
          <p className="mb-2 text-[13px] font-semibold">{t.quiz.whyNot}</p>
          <ul className="flex flex-col gap-2">
            {wrongWithReason.map(([i, reason]) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-control font-mono text-xs font-semibold" aria-hidden="true">
                  {letterOf(i)}
                </span>
                <span>
                  <span className="sr-only">{letterOf(i)}: </span>
                  <RichText text={reason} inline />
                  {i === selectedIndex && <span className="sr-only"> ({options[i]})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-4">
          {sourceReference && (
            <p className="text-xs text-faint">
              {t.quiz.source}: {sourceReference}
            </p>
          )}
          <ReportProblem questionId={questionId} />
        </div>
        <Button onClick={onNext} disabled={nextDisabled} iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />} data-testid="next-question">
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
