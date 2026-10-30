"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, GitBranch, Lock, SlidersHorizontal, SquareTerminal, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { CourseSimulation, SimulationStatus } from "@/lib/server/simulations/service";
import type { Locale } from "@/lib/types";

const ICONS = { terminal: SquareTerminal, decision: GitBranch, config: SlidersHorizontal } as const;
const TYPE = { terminal: ["Terminal", "Terminal"], decision: ["Entscheidung", "Decision"], config: ["Konfiguration", "Configuration"] } as const;
const STATUS: Record<SimulationStatus, { de: string; en: string; tone: "neutral" | "warning" | "mint" }> = {
  open: { de: "Offen", en: "Open", tone: "neutral" },
  struggled: { de: "Mit Mühe gelöst", en: "Solved with help", tone: "warning" },
  solved: { de: "Gelöst", en: "Solved", tone: "mint" },
};

type Filter = "all" | SimulationStatus;
const href = (certSlug: string, s: CourseSimulation) => `/cert/${certSlug}/section/${s.sectionId}#simulation-${s.number}`;

/**
 * Simulations-Übersicht eines Kurses: alle Simulationen in Kursreihenfolge, nach Domain gruppiert, mit Stand und Filter.
 * Ein Klick führt direkt zur Simulation in ihrer Lektion; „Nächste offene“ springt zur ersten ungelösten.
 */
export function SimulationsOverview({ certSlug, items, locked = [], locale, signedIn }: { certSlug: string; items: CourseSimulation[]; /** Kapitel, deren Simulationen erst nach dem Abschluss des Kapitels freigeschaltet werden. */ locked?: Array<{ name: string; count: number }>; locale: Locale; signedIn: boolean }) {
  const de = locale === "de";
  const [filter, setFilter] = React.useState<Filter>("all");
  const count = (s: SimulationStatus) => items.filter((i) => i.status === s).length;
  const shown = items.filter((i) => filter === "all" || i.status === filter);
  const next = items.find((i) => i.status === "open") ?? items.find((i) => i.status === "struggled");
  const domains = [...new Set(shown.map((i) => i.domain))];

  return (
    <div className="flex flex-col gap-5">
      {signedIn && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="simulations-summary">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {count("solved") + count("struggled")} {de ? "von" : "of"} {items.length} {de ? "gelöst" : "solved"}
            </p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span className="bg-mint" style={{ width: `${(count("solved") / items.length) * 100}%` }} />
              <span className="bg-warning" style={{ width: `${(count("struggled") / items.length) * 100}%` }} />
            </div>
            {count("struggled") > 0 && <p className="mt-1.5 text-xs text-subtle">{de ? `${count("struggled")} nur mit Hilfe gelöst: am besten noch einmal ohne Tipp versuchen.` : `${count("struggled")} solved only with help: try them again without hints.`}</p>}
          </div>
          {next && (
            <Link href={href(certSlug, next)} className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90" data-testid="simulations-next">
              {next.status === "open" ? (de ? "Nächste offene" : "Next open") : de ? "Noch einmal üben" : "Practise again"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {signedIn && items.length > 0 && (
        <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface-inset p-1" role="group" aria-label={de ? "Filter" : "Filter"}>
          {(["all", "open", "struggled", "solved"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-md px-2.5 text-meta font-medium", filter === f ? "bg-surface-2 text-foreground" : "text-subtle hover:text-foreground")} data-testid={`simulations-filter-${f}`}>
              {f === "all" ? `${de ? "Alle" : "All"} (${items.length})` : `${STATUS[f][locale]} (${count(f)})`}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 && locked.length > 0 && (
        <p className="text-sm text-subtle" data-testid="simulations-none-unlocked">
          {de ? "Noch ist keine Simulation freigeschaltet. Sie erscheinen hier, sobald du das jeweilige Kapitel abgeschlossen hast." : "No simulation is unlocked yet. They appear here as soon as you have completed the respective chapter."}
        </p>
      )}
      {items.length > 0 && shown.length === 0 && <p className="text-sm text-subtle">{de ? "Keine Simulationen in dieser Auswahl." : "No simulations in this selection."}</p>}
      {domains.map((d) => (
        <section key={d}>
          <h2 className="mb-2 text-2xs font-semibold tracking-overline text-faint uppercase">{d}</h2>
          <ul className="flex flex-col gap-2">
            {shown
              .filter((i) => i.domain === d)
              .map((s) => {
                const Icon = ICONS[s.type];
                const StatusIcon = s.status === "solved" ? CheckCircle2 : s.status === "struggled" ? TriangleAlert : Circle;
                return (
                  <li key={`${s.sectionId}-${s.number}`}>
                    <Link href={href(certSlug, s)} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 hover:bg-surface-2" data-testid="simulation-entry" data-status={s.status}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-link" aria-hidden="true">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.title[locale]}</span>
                        <span className="block truncate text-xs text-subtle">
                          {TYPE[s.type][de ? 0 : 1]} · <span className="font-mono">{s.objectiveCode}</span> · {s.sectionTitle[locale]}
                        </span>
                      </span>
                      {signedIn && (
                        <Badge tone={STATUS[s.status].tone} className="shrink-0">
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          <span className="hidden sm:inline">{STATUS[s.status][locale]}</span>
                          <span className="sr-only sm:hidden">{STATUS[s.status][locale]}</span>
                        </Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {locked.length > 0 && (
        <section data-testid="simulations-locked">
          <h2 className="mb-2 text-2xs font-semibold tracking-overline text-faint uppercase">{de ? "Noch gesperrt" : "Still locked"}</h2>
          <ul className="flex flex-col gap-2">
            {locked.map((c) => (
              <li key={c.name} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-subtle" data-testid="simulation-locked-entry">
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs">{de ? `${c.count} Simulation(en) nach Abschluss des Kapitels` : `${c.count} simulation(s) after completing the chapter`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
