"use client";

import { Check, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REGION_NAMES, type RegionCode } from "@/lib/salary/parse";
import type { CareerView } from "@/lib/server/career/service";
import { cn } from "@/lib/cn";

const LEVEL = { 1: ["Helfer", "Helper"], 2: ["Fachkraft", "Skilled worker"], 3: ["Spezialist", "Specialist"], 4: ["Experte", "Expert"] } as const;

/**
 * Karrierepfade (roadmap3.md, Schritt 9): 3–5 Stellen auf Abruf. „Mehr Informationen“ zeigt Beschreibung, Aufgaben,
 * fehlende Fähigkeiten, Kurse aus dem Katalog in Reihenfolge (abgeschlossene abgehakt) und das Gehalt (Median und
 * mittlere 50 %, Bundesland aus dem Profil) mit Quelle und Stichtag.
 */
export function CareerPaths({ initial, locale }: { initial: CareerView; locale: "de" | "en" }) {
  const de = locale === "de";
  const tr = (d: string, e: string) => (de ? d : e);
  const [view, setView] = React.useState(initial);
  const [open, setOpen] = React.useState<string | null>(null);
  const [allStates, setAllStates] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const eur = (n: number) => `${n.toLocaleString(de ? "de-DE" : "en-GB")} €`;

  async function refresh() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/career", { method: "POST" });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? tr("Das hat nicht geklappt.", "That did not work."));
    setView(json as CareerView);
    setOpen(null);
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{tr("Karrierepfade", "Career paths")}</h1>
          <p className="mt-1 max-w-xl text-sm text-foreground/70">
            {tr("Passende nächste Stellen aus deinem Profil, mit den Kursen, die dich dorthin bringen. Die Vorschläge entstehen mit KI; dafür werden Profil und Skills an den KI-Dienst geschickt.", "Suitable next jobs based on your profile, with the courses that get you there. Suggestions are created with AI; your profile and skills are sent to the AI service for this.")}
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={busy || !view.enoughProfile || view.runsLeft <= 0} iconLeft={view.paths.length ? <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} data-testid="career-refresh">
          {busy ? tr("Berechne …", "Calculating …") : view.paths.length ? (view.stale ? tr("Pfade aktualisieren", "Update paths") : tr("Neu berechnen", "Recalculate")) : tr("Pfade vorschlagen", "Suggest paths")}
        </Button>
      </header>

      {!view.enoughProfile && (
        <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" role="status">
          {tr("Trag zuerst im Profil deine aktuelle Stelle oder mindestens zwei Skills ein. ", "First add your current job or at least two skills in your profile. ")}
          <Link href="/profile" className="font-medium underline">{tr("Zum Profil", "Go to profile")}</Link>
        </p>
      )}
      {view.stale && view.paths.length > 0 && (
        <p className="rounded-xl border border-info/40 bg-info-soft p-3 text-sm text-info-text" role="status" data-testid="career-stale">
          {tr("Dein Profil, deine Skills oder Abschlüsse haben sich seit der letzten Berechnung geändert. Mit „Pfade aktualisieren“ passen sich die Vorschläge an. Der Kursstand unten ist schon aktuell.", "Your profile, skills or completions changed since the last calculation. “Update paths” adapts the suggestions. The course status below is already current.")}
        </p>
      )}
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger-text">{error}</p>}
      {view.generatedAt && <p className="text-xs text-faint">{tr("Berechnet am", "Calculated on")} {new Date(view.generatedAt).toLocaleString(de ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" })} · {tr("noch", "")} {view.runsLeft} {tr("Berechnungen heute", "calculations left today")}</p>}

      <ul className="flex flex-col gap-3" data-testid="career-list">
        {view.paths.map((p) => {
          const isOpen = open === p.id;
          const own = view.profileState && p.salary?.regions.find((r) => r.region === view.profileState);
          const country = p.salary?.regions.find((r) => r.region === "DE");
          const shown = own || country || p.salary?.regions[0];
          const done = p.courseItems.filter((c) => c.completed).length;
          return (
            <li key={p.id} className="rounded-2xl border border-border bg-surface" data-testid="career-path">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{p.title}</h2>
                  <p className="mt-1 text-sm text-foreground/80">{p.fit}</p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
                    <span>{LEVEL[p.level as 1 | 2 | 3 | 4]?.[de ? 0 : 1]}</span>
                    {p.courseItems.length > 0 && <span>{done}/{p.courseItems.length} {tr("Kurse abgeschlossen", "courses completed")}</span>}
                    {shown && <span>{tr("Median", "Median")} {eur(shown.median)} {tr("brutto/Monat", "gross/month")}</span>}
                  </p>
                </div>
                <Button className="self-start" variant="secondary" size="sm" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />} data-testid="career-more">
                  {tr("Mehr Informationen", "More information")}
                </Button>
              </div>
              {isOpen && (
                <div className="flex flex-col gap-4 border-t border-border-subtle p-4 text-sm" data-testid="career-details">
                  <section>
                    <h3 className="font-semibold">{tr("Was die Stelle macht", "What the job involves")}</h3>
                    <p className="mt-1 text-foreground/80">{p.summary}</p>
                    {p.tasks.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-foreground/80">
                        {p.tasks.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="font-semibold">{tr("Kurse in sinnvoller Reihenfolge", "Courses in a sensible order")}</h3>
                    {p.courseItems.length === 0 ? (
                      <p className="mt-1 text-subtle">{tr("Dafür gibt es im Katalog noch keinen passenden Kurs.", "There is no matching course in the catalog yet.")}</p>
                    ) : (
                      <ol className="mt-2 flex flex-col gap-2">
                        {p.courseItems.map((c, i) => (
                          <li key={c.id} className="flex items-start gap-3 rounded-xl border border-border-subtle px-3 py-2" data-testid="career-course">
                            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", c.completed ? "bg-mint-soft text-mint-text" : "bg-surface-2 text-subtle")}>
                              {c.completed ? <Check className="h-3.5 w-3.5" aria-label={tr("abgeschlossen", "completed")} /> : i + 1}
                            </span>
                            <span className="min-w-0">
                              <Link href={`/cert/${c.slug}`} className="font-medium hover:text-link">{c.name}</Link>
                              <span className="block text-xs text-subtle">{c.reason}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {p.uncoveredTopics.length > 0 && (
                      <p className="mt-2 text-xs text-subtle">{tr("Noch kein Kurs im Katalog zu:", "No catalog course yet for:")} {p.uncoveredTopics.join(", ")}</p>
                    )}
                  </section>

                  {p.missingSkills.length > 0 && (
                    <section>
                      <h3 className="font-semibold">{tr("Was dir noch fehlt", "What you still need")}</h3>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.missingSkills.map((s, i) => (
                          <Badge key={i} tone="neutral">{s}</Badge>
                        ))}
                      </div>
                    </section>
                  )}

                  <section data-testid="career-salary">
                    <h3 className="font-semibold">{tr("Gehalt", "Salary")}</h3>
                    {!p.salary ? (
                      <p className="mt-1 text-subtle">{tr("Dazu liegen noch keine Gehaltsdaten vor.", "No salary data available for this yet.")}</p>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-subtle">
                          {p.salary.occupationName ?? `KldB ${p.salary.kldb}`}
                          {p.salary.level ? ` · ${LEVEL[p.salary.level as 1 | 2 | 3 | 4]?.[de ? 0 : 1]}` : ""}
                          {p.salary.approximate ? ` · ${tr("verwandte Berufsgruppe", "related occupation group")}` : ""}
                        </p>
                        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-left text-xs sm:text-sm">
                            <thead>
                              <tr className="border-b border-border bg-surface-inset text-xs text-subtle">
                                <th className="px-2 py-1.5 sm:px-3">{tr("Region", "Region")}</th>
                                <th className="px-2 py-1.5 sm:px-3 text-right">{tr("Median", "Median")}</th>
                                <th className="px-2 py-1.5 sm:px-3 text-right">{tr("Mitte 50 %", "Middle 50%")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...p.salary.regions]
                                .filter((r) => allStates || r.region === "DE" || r.region === view.profileState)
                                .map((r) => (
                                  <tr key={r.region} className={cn("border-t border-border-subtle", r.region === view.profileState && "bg-accent-soft")}>
                                    <td className="px-2 py-1.5 sm:px-3">{REGION_NAMES[r.region as RegionCode]}{r.region === view.profileState ? ` (${tr("dein Bundesland", "your state")})` : ""}</td>
                                    <td className="px-2 py-1.5 sm:px-3 text-right font-medium whitespace-nowrap tabular-nums">{eur(r.median)}</td>
                                    <td className="px-2 py-1.5 sm:px-3 text-right whitespace-nowrap tabular-nums">{r.q25 && r.q75 ? `${eur(r.q25)} – ${eur(r.q75)}` : "–"}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {p.salary.regions.length > 2 && (
                          <button type="button" className="mt-1.5 text-xs text-link hover:underline" onClick={() => setAllStates((a) => !a)} data-testid="career-all-states">
                            {allStates ? tr("Nur Deutschland und mein Bundesland", "Only Germany and my state") : tr("Alle Bundesländer anzeigen", "Show all states")}
                          </button>
                        )}
                        <p className="mt-1.5 text-xs text-faint">
                          {tr("Bruttomonatsentgelt Vollzeit. Quelle:", "Gross monthly pay, full time. Source:")} {p.salary.source}, {tr("Stand", "as of")} {new Date(`${p.salary.referenceDate}T00:00:00Z`).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" })}. {tr("Median = die Hälfte verdient mehr, die Hälfte weniger. Nur Sozialversicherungspflichtige; Zusatzleistungen und Spitzengehälter über der Beitragsgrenze sind nicht erfasst.", "Median = half earn more, half less. Social-insurance-liable employees only; extras and top salaries above the contribution ceiling are not included.")}
                        </p>
                        {!view.profileState && <p className="mt-1 text-xs text-subtle">{tr("Trag dein Bundesland im Profil ein, dann steht es hier oben.", "Add your state in your profile to highlight it here.")}</p>}
                      </>
                    )}
                  </section>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
