"use client";

import { FocusFrame } from "@/components/quiz/FocusFrame";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useLocale } from "@/lib/i18n";

/** Abschluss nach „Heute reicht's“: freundlich, ohne Wertung der abgebrochenen Aufgabe; optional mit Weg zu den Erfolgsaufgaben. */
export function ExitSummary({ certSlug, winSession, contextLabel }: { certSlug: string; winSession: boolean; contextLabel: string }) {
  const { t } = useLocale();
  const exitHref = `/cert/${certSlug}`;
  return (
    <FocusFrame exitHref={exitHref} confirmLeave={false} contextLabel={contextLabel} mode="practice" segments={[]} counterText="">
      <ResultSummary
        score={100}
        headline={t.quiz.exitHeadline}
        offlineNote={false}
        actions={
          winSession
            ? [{ href: `/cert/${certSlug}/session`, label: t.quiz.exitWinStart, primary: true }, { href: exitHref, label: t.quiz.backToCourse }]
            : [{ href: exitHref, label: t.quiz.backToCourse, primary: true }]
        }
      >
        <p className="text-left text-sm" role="status" data-testid="exit-result">{winSession ? t.quiz.exitWinHint : t.quiz.exitDoneHint}</p>
      </ResultSummary>
    </FocusFrame>
  );
}
