"use client";

import Link from "next/link";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

export type DomainResult = { id: string; name: string; score: number };

/** Ergebnisseite nach Sitzung/Prüfung: Ring mit Bestehensmarke, Balken je Domain, Aktionen. Konfetti gibt es bewusst nicht. */
export function ResultSummary({
  score,
  passPercent,
  headline,
  subline,
  domains,
  weakAreas,
  recommendations,
  actions,
  offlineNote,
  children,
}: {
  score: number;
  passPercent?: number | null;
  headline: string;
  subline?: string;
  domains?: DomainResult[];
  weakAreas?: string[];
  recommendations?: string[];
  actions: Array<{ href: string; label: string; primary?: boolean }>;
  offlineNote?: boolean;
  /** Zusätzlicher Inhalt vor den Aktionen (z. B. empfohlene Lektionen). */
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-5" data-testid="result-summary">
      <Card className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <ProgressRing value={score} markAt={passPercent ?? undefined} caption={t.quiz.outOf} label={`${t.quiz.resultTitle}: ${score}`} />
        <div>
          <h1 className="text-xl font-semibold">{headline}</h1>
          {subline && <p className="mt-1 text-sm text-subtle">{subline}</p>}
          {passPercent != null && <p className="mt-1 text-xs text-faint">{fmt(t.quiz.passMark, { n: passPercent })}</p>}
          {offlineNote && <p className="mt-3 text-xs text-faint">{t.quiz.offlineNote}</p>}
        </div>
      </Card>

      {domains && domains.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t.quiz.byDomain}</h2>
          <ul className="flex flex-col gap-3">
            {domains.map((d) => (
              <li key={d.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{d.name}</span>
                  <span className="shrink-0 tabular-nums text-subtle">
                    {d.score} % · {d.score >= 70 ? t.quiz.strong : t.quiz.weak}
                  </span>
                </div>
                <ProgressBar value={d.score} tone={d.score >= 70 ? "mint" : "warning"} label={d.name} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {weakAreas && weakAreas.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">{t.quiz.weakAreas}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {weakAreas.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {recommendations && recommendations.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">{t.quiz.recommendations}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      {children}

      <div className="flex flex-wrap gap-3">
        {actions.map((a) => (
          <Button key={a.href + a.label} asChild variant={a.primary ? "primary" : "secondary"}>
            <Link href={a.href}>{a.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
