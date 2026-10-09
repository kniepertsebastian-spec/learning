"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { useLocaleOptional } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { SectionOutline } from "@/lib/server/sections/outline";

/** Gliederung der Domain: Sektionen mit Kreis-Status (erledigt = Mint gefüllt mit Häkchen, aktuell = Mint-Ring, offen = grau). */
export function OutlineList({ outline, certSlug, onNavigate }: { outline: SectionOutline; certSlug: string; onNavigate?: () => void }) {
  const { locale, t } = useLocaleOptional();
  return (
    <div data-testid="outline">
      <p className="mb-1 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase">{outline.domain.name}</p>
      <ol className="mt-2 flex flex-col gap-0.5">
        {outline.sections.map((s) => (
          <li key={s.id}>
            <Link
              href={`/cert/${certSlug}/section/${s.id}`}
              onClick={onNavigate}
              aria-current={s.status === "current" ? "page" : undefined}
              data-status={s.status}
              className={cn("flex min-h-10 items-start gap-2.5 rounded-lg px-2 py-2 text-sm", s.status === "current" ? "bg-nav-active font-medium text-foreground" : "text-muted hover:bg-nav-active/60 hover:text-foreground")}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2",
                  s.status === "done" && "border-mint bg-mint text-on-accent",
                  s.status === "current" && "border-mint",
                  s.status === "open" && "border-border-strong",
                )}
                aria-hidden="true"
              >
                {s.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block">{s.title[locale]}</span>
                <span className="sr-only">
                  {" "}
                  ({s.status === "done" ? t.lesson_page.done : s.status === "current" ? t.lesson_page.current : t.lesson_page.open})
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl border border-border-subtle bg-surface-inset p-3">
        <p className="mb-1.5 text-xs text-subtle">{t.lesson_page.domainProgress}</p>
        <ProgressBar value={outline.domainProgress} tone="mint" label={t.lesson_page.domainProgress} />
        <div className="mt-1.5 flex justify-between text-xs text-faint">
          <span className="tabular-nums">{outline.domainProgress} %</span>
          {outline.domain.weightPercent !== null && <span>{fmt(t.lesson_page.domainWeight, { n: Math.round(outline.domain.weightPercent) })}</span>}
        </div>
      </div>
    </div>
  );
}
