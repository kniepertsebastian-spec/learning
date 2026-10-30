"use client";

import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import { RichText } from "@/components/RichText";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { SolutionView } from "@/components/quiz/FormatAnswerInput";
import { Button } from "@/components/ui/button";
import { SelfExplanation } from "@/components/quiz/SelfExplanation";
import type { AnswerSolution } from "@/lib/questions/answer-formats";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { AnswerConfidence, Locale } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Feedback für die neuen Antwortformate: Ergebnis, Lösung, Erklärung, Quelle, Meldung, „Nächste Frage“. Das Rating bleibt binär; Teilpunkte nur als Hinweis. */
export function FormatFeedbackPanel({
  correct,
  partial,
  solution,
  explanation,
  confidence,
  sourceReference,
  questionId,
  nextLabel,
  onNext,
  nextDisabled,
  rereadHref,
  note,
  locale,
  selfExplain,
}: {
  correct: boolean;
  partial?: number;
  solution?: AnswerSolution;
  explanation: string;
  confidence?: AnswerConfidence | null;
  sourceReference?: string | null;
  questionId: string;
  nextLabel: string;
  onNext: () => void;
  nextDisabled?: boolean;
  rereadHref?: string | null;
  note?: string | null;
  locale: Locale;
  selfExplain?: boolean;
}) {
  const { t } = useLocale();
  const de = locale === "de";
  const confidenceLabel = confidence ? t.quiz[confidence] : null;
  return (
    <div className={cn("anim-fade-in rounded-2xl border border-t-[3px] border-border bg-surface p-5", correct ? "border-t-success" : "border-t-danger")} role="status" aria-live="polite" data-testid="feedback-panel" data-correct={correct}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("flex items-center gap-2 text-base font-semibold", correct ? "text-mint-text" : "text-danger-text")}>
          {correct ? <CircleCheck className="h-5 w-5" aria-hidden="true" /> : <CircleX className="h-5 w-5" aria-hidden="true" />}
          {correct ? t.quiz.correct : de ? "Noch nicht ganz" : "Not quite"}
          {!correct && partial !== undefined && partial > 0 && <span className="text-sm font-normal text-subtle">{de ? `· ${Math.round(partial * 100)} % richtig` : `· ${Math.round(partial * 100)}% right`}</span>}
        </p>
        {confidenceLabel && <p className="text-xs text-subtle">{fmt(t.quiz.yourConfidence, { c: confidenceLabel })}</p>}
      </div>
      {!correct && note && <p className="mt-2 text-xs text-subtle" data-testid="platform-note">{note}</p>}
      {!correct && solution && <SolutionView solution={solution} locale={locale} />}
      <div className="mt-3 text-body leading-[1.65] text-foreground">
        <RichText text={explanation} />
      </div>
      {!correct && selfExplain && <SelfExplanation storageKey={`q:${questionId}`} prompt={de ? "Erkläre in einem Satz, warum das die richtige Lösung ist." : "Explain in one sentence why this is the right solution."} modelAnswer={explanation} locale={locale} />}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-4">
          {sourceReference && <p className="text-xs text-faint">{t.quiz.source}: {sourceReference}</p>}
          {!correct && rereadHref && (
            <a href={rereadHref} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline" data-testid="reread-link">{t.quiz.reread}</a>
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
