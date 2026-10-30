"use client";

import { c_quizFeedbackPanel } from "@/lib/i18n/components/quizFeedbackPanel";
import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import { RichText } from "@/components/RichText";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { Button } from "@/components/ui/button";
import { SelfExplanation } from "@/components/quiz/SelfExplanation";
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
  rereadHref,
  note,
  selfExplain,
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
  /** Link zur passenden Lektion, nur bei falscher Antwort gezeigt. */
  rereadHref?: string | null;
  /** Echte Plattformstatistik (nur mit Datenbasis), freundlich und ohne Wertung. */
  note?: string | null;
  /** Freiwillige Selbsterklärung anbieten (nur nach falscher Antwort; nicht bewertet, nur auf diesem Gerät). */
  selfExplain?: boolean;
}) {
  const { t, locale } = useLocale();
  const given = (rationales ?? []).some((r, i) => r && i !== correctIndex);
  const fetched = useLazyRationales(questionId, options, locale, !correct && !given);
  const shown = given ? rationales : fetched;
  const wrongWithReason = (shown ?? []).flatMap((r, i) => (r && i !== correctIndex ? [[i, r] as const] : []));
  const confidenceLabel = confidence ? t.quiz[confidence] : null;

  return (
    <div
      className={cn("anim-fade-in rounded-2xl border border-t-[3px] border-border bg-surface p-5", correct ? "border-t-success" : "border-t-danger")}
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
      {!correct && note && <p className="mt-2 text-xs text-subtle" data-testid="platform-note">{note}</p>}

      <div className="mt-3 text-body leading-[1.65] text-foreground">
        <RichText text={explanation} />
      </div>

      {!correct && selfExplain && <SelfExplanation storageKey={`q:${questionId}`} prompt={c_quizFeedbackPanel(locale).explainInOneSentenceWhy} modelAnswer={explanation} locale={locale} />}

      {wrongWithReason.length > 0 && (
        <div className="mt-4 border-t border-border pt-4" data-testid="option-rationales">
          <p className="mb-2 text-meta font-semibold">{t.quiz.whyNot}</p>
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
          {!correct && rereadHref && (
            <a href={rereadHref} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline" data-testid="reread-link">
              {t.quiz.reread}
            </a>
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

/**
 * Begründungen bei Bedarf (siehe /api/questions/:id/rationales): nur nach einer falschen Antwort und nur, wenn die Frage
 * noch keine mitbringt. Die Antwort wird über den Optionstext (aktuelle Sprache) zugeordnet, weil die Oberfläche die
 * Optionen in eigener Reihenfolge zeigen kann. Ein Fehler (offline, kein KI-Zugang) lässt den Abschnitt einfach weg.
 */
function useLazyRationales(questionId: string, options: string[], locale: "de" | "en", enabled: boolean): Array<string | null> | undefined {
  const [result, setResult] = useState<Array<string | null> | undefined>(undefined);
  const optionKey = options.join("\u0000");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/questions/${questionId}/rationales`, { method: "POST" });
        if (!response.ok) return;
        const body = (await response.json()) as { options: Array<{ text: { de: string; en: string }; rationale: { de: string; en: string } | null }> | null };
        if (cancelled || !body.options) return;
        const byText = new Map(body.options.map((o) => [o.text[locale], o.rationale?.[locale] ?? null]));
        setResult(optionKey.split("\u0000").map((text) => byText.get(text) ?? null));
      } catch {
        // offline oder Netzfehler: ohne Begründungen weiter
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [questionId, optionKey, locale, enabled]);
  return enabled ? result : undefined;
}
