"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import type { Improvement, ImprovementKind, CourseReport as Report, Severity } from "@/lib/server/course-editor/report";
import { cn } from "@/lib/cn";
import { AI_ACTION_LABELS, type AiAction } from "@/lib/workshop-ai";
import { AiBatchPanel } from "@/components/admin/AiBatchPanel";
import { MissingObjective } from "./MissingObjective";
import { api, formatDate, Problems, useTr, type Lang } from "./shared";

const TONE: Record<Severity, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };

/** Passende KI-Aktion je Verbesserungspunkt (roadmap3.md, Schritt 3). */
const LESSON_AI: Partial<Record<ImprovementKind, AiAction>> = { open_report: "fix_reports", no_exam_callout: "exam", hands_on_without_simulation: "simulation", thin_lesson: "expand" };
function aiActionFor(i: Improvement): AiAction | null {
  if (i.kind === "missing_objective") return i.missing ? "add_objective" : null;
  if (i.kind === "few_questions" || i.kind === "one_question_type") return "add_questions";
  return i.sectionId ? (LESSON_AI[i.kind] ?? null) : null;
}

/** Arten von Punkten, die die KI im Sammellauf bearbeiten kann (Reihenfolge wie in der Auswahl). */
const BATCH_LABELS: Array<{ kind: ImprovementKind; de: string; en: string }> = [
  { kind: "open_report", de: "Gemeldete Fehler beheben", en: "Fix reported problems" },
  { kind: "hard_question", de: "Schwierige Fragen verbessern", en: "Improve hard questions" },
  { kind: "few_questions", de: "Fehlende Fragen ergänzen", en: "Add missing questions" },
  { kind: "one_question_type", de: "Fragetypen mischen", en: "Mix question types" },
  { kind: "hands_on_without_simulation", de: "Simulationen bei praxisnahen Lektionen", en: "Simulations for hands-on lessons" },
  { kind: "no_exam_callout", de: "Prüfungshinweise ergänzen", en: "Add exam callouts" },
  { kind: "thin_lesson", de: "Sehr kurze Lektionen ausbauen", en: "Expand very short lessons" },
  { kind: "missing_objective", de: "Fehlende Lernziele anlegen (aufwendig)", en: "Create missing objectives (expensive)" },
];
const DEFAULT_BATCH_KINDS: ImprovementKind[] = BATCH_LABELS.map((l) => l.kind).filter((k) => k !== "missing_objective");

export type OpenTarget = { objectiveId: string; sectionId: string | null; ai?: AiAction | null };

/**
 * Qualitätsbericht (roadmap3.md, Schritt 2): Kennzahlen je Domain, Abdeckung der offiziellen Lernziele gegen die Quelle
 * (mit „Quelle prüfen“) und „Verbesserungspotenzial“, jeweils mit Sprung zur betroffenen Lektion oder zu den Fragen.
 */
export function CourseReport({ certId, locale, onOpen, onObjectiveCreated }: { certId: string; locale: Lang; onOpen: (target: OpenTarget) => void; onObjectiveCreated: (target: OpenTarget) => void }) {
  const tr = useTr(locale);
  const [report, setReport] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState<Severity | "all">("all");
  const [missingOpen, setMissingOpen] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [batchKinds, setBatchKinds] = React.useState<ImprovementKind[]>(DEFAULT_BATCH_KINDS);

  const load = React.useCallback(async () => {
    const r = await api<Report>(`/api/admin/certifications/${certId}/workshop/report`);
    if (r.ok) setReport(r.data);
    else setError(r.error);
  }, [certId]);

  React.useEffect(() => {
    void (async () => {
      const r = await api<Report>(`/api/admin/certifications/${certId}/workshop/report`);
      if (r.ok) setReport(r.data);
      else setError(r.error);
    })();
  }, [certId]);

  async function checkSource(accept = false) {
    setBusy(true);
    setError(null);
    const r = await api<Report>(`/api/admin/certifications/${certId}/workshop/report/coverage${accept ? "?accept=1" : ""}`, { method: "POST" });
    setBusy(false);
    if (r.ok) setReport(r.data);
    else setError(r.error);
  }

  if (!report) return error ? <Problems title={error} /> : <p className="text-sm text-subtle">{tr("Lade …", "Loading …")}</p>;
  const c = report.coverage;
  const sev: Record<Severity, string> = { high: tr("Wichtig", "High"), medium: tr("Mittel", "Medium"), low: tr("Gering", "Low") };
  const shown = report.improvements.filter((i) => filter === "all" || i.severity === filter);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const i of report.improvements) counts[i.severity]++;

  return (
    <div className="flex flex-col gap-6" data-testid="course-report">
      <div>
        <h2 className="text-lg font-semibold">{tr("Qualitätsbericht", "Quality report")}</h2>
        <p className="mt-1 text-sm text-subtle">{tr("Wo der Kurs Lücken hat und was sich zu verbessern lohnt. Alles aus den vorhandenen Daten, ohne KI.", "Where the course has gaps and what is worth improving. All from existing data, no AI.")}</p>
      </div>
      {error && <Problems title={error} />}
      {message && <p className="rounded-xl border border-mint-border bg-mint-soft p-3 text-sm text-mint-text" role="status">{message}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={tr("Lernziele", "Objectives")} value={report.totals.objectives} sub={`${report.totals.domains} ${tr("Domains", "domains")}`} />
        <StatTile label={tr("Lektionen", "Lessons")} value={report.totals.sections} sub={`${report.totals.simulations} ${tr("mit Simulation", "with simulation")}`} />
        <StatTile label={tr("Fragen", "Questions")} value={report.totals.questions} />
        <StatTile label={tr("Offene Meldungen", "Open reports")} value={report.totals.openReports} subTone={report.totals.openReports > 0 ? "danger" : "default"} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4" data-testid="coverage">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{tr("Abdeckung der offiziellen Lernziele", "Coverage of official objectives")}</h3>
          {c.canRefresh && (
            <Button className="ml-auto" size="sm" variant="secondary" onClick={() => void checkSource()} disabled={busy} iconLeft={<RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden="true" />} data-testid="coverage-refresh">
              {tr("Quelle prüfen", "Check source")}
            </Button>
          )}
        </div>
        {c.unavailable === "custom_course" && <p className="mt-2 text-sm text-subtle">{tr("Individuelles Training: es gibt keine offiziellen Lernziele.", "Custom training: there are no official objectives.")}</p>}
        {c.unavailable === "no_job" && <p className="mt-2 text-sm text-subtle">{tr("Zu diesem Kurs gibt es keinen Erzeugungsauftrag mit Quelle, daher keine Abdeckungsprüfung.", "This course has no generation job with a source, so there is no coverage check.")}</p>}
        {!c.unavailable && !c.checkedAt && <p className="mt-2 text-sm text-subtle">{tr("Noch nicht geprüft. „Quelle prüfen“ ruft die Quelle erneut ab und erkennt die nummerierten Lernziele.", "Not checked yet. “Check source” re-fetches the source and detects the numbered objectives.")}</p>}
        {c.result?.status === "not_numbered" && (
          <p className="mt-2 text-sm text-subtle">{tr(`In der Quelle wurden nur ${c.result.recognised} nummerierte Lernziele erkannt. Dafür lässt sich die Abdeckung nicht automatisch prüfen (z. B. Gliederung ohne Nummern).`, `Only ${c.result.recognised} numbered objectives were found in the source, so coverage can't be checked automatically (e.g. an outline without numbers).`)}</p>
        )}
        {c.result?.status === "ok" && (
          <div className="mt-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              {c.result.missing.length === 0 ? <CheckCircle2 className="h-4 w-4 text-mint-text" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-warning-text" aria-hidden="true" />}
              <span className="font-medium">{c.result.covered.length} {tr("von", "of")} {c.result.recognised} {tr("offiziellen Lernzielen im Kurs", "official objectives in the course")}</span>
              {c.result.missing.length > 0 && <Badge tone="danger">{c.result.missing.length} {tr("fehlen", "missing")}</Badge>}
            </p>
            {c.result.missing.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-foreground/80" data-testid="coverage-missing">
                {c.result.missing.map((m) => (
                  <li key={m.code}><span className="font-mono text-xs">{m.code}</span> {m.title}</li>
                ))}
              </ul>
            )}
            {c.result.extra.length > 0 && <p className="mt-2 text-xs text-subtle">{tr("Im Kurs, aber nicht als nummeriertes Lernziel in der Quelle erkannt:", "In the course but not recognised as a numbered objective in the source:")} {c.result.extra.join(", ")}</p>}
          </div>
        )}
        {c.truncated.length > 0 && (
          <div className="mt-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" role="status" data-testid="coverage-truncated">
            <p className="font-semibold">{tr("Gekürzte Quelle", "Truncated source")}</p>
            <p className="mt-0.5">{tr("Diese Quelle war für die KI zu lang und wurde gekürzt: Lernziele aus dem hinteren Teil können im Kurs fehlen.", "This source was too long for the AI and was truncated: objectives from the later part may be missing from the course.")}</p>
            <ul className="mt-1 list-disc pl-5">
              {c.truncated.map((t) => (
                <li key={t.url} className="break-all">{t.title}</li>
              ))}
            </ul>
          </div>
        )}
        {c.change && (
          <div className="mt-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-text" role="status" data-testid="coverage-change">
            <p className="font-semibold">{tr("Die Quelle hat sich geändert", "The source has changed")}</p>
            <p className="mt-0.5">
              {tr(`Verglichen mit dem Stand vom ${formatDate(c.change.since, locale)}`, `Compared with the version from ${formatDate(c.change.since, locale)}`)}
              {c.change.versionsBefore.join(", ") !== c.change.versionsNow.join(", ") && c.change.versionsNow.length > 0 && (
                <> · {tr("Prüfungsversion", "Exam version")}: {c.change.versionsBefore.join(", ") || "?"} → <strong>{c.change.versionsNow.join(", ")}</strong></>
              )}
              {c.change.textChanged && !c.change.added.length && !c.change.removed.length && <> · {tr("der Text ist anders, die Lernziele sind gleich geblieben", "the text differs, the objectives stayed the same")}</>}
            </p>
            {c.change.added.length > 0 && <p className="mt-1">{tr("Neu:", "New:")} {c.change.added.map((o) => `${o.code} ${o.title}`).join(" · ")}</p>}
            {c.change.removed.length > 0 && <p className="mt-1">{tr("Entfallen:", "Removed:")} {c.change.removed.map((o) => `${o.code} ${o.title}`).join(" · ")}</p>}
            <p className="mt-1 text-xs">{tr("Neue Lernziele erscheinen unten als „fehlt im Kurs“ und lassen sich mit der KI ergänzen. Ist der Kurs angepasst, bestätige den Stand.", "New objectives show up below as “missing” and can be added with AI. Once the course is updated, confirm the version.")}</p>
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => void checkSource(true)} disabled={busy} data-testid="coverage-accept">
              {tr("Als aktuellen Stand bestätigen", "Confirm as current version")}
            </Button>
          </div>
        )}
        {c.primary && (
          <p className="mt-2 text-xs text-subtle" data-testid="coverage-primary">
            {tr("Prüfungsleitfaden (vollständig gelesen):", "Exam guide (read in full):")} <span className="break-all">{c.primary.title}</span>
          </p>
        )}
        {c.checkedAt && <p className="mt-2 text-xs text-faint">{tr("Quelle geprüft am", "Source checked on")} {formatDate(c.checkedAt, locale)} · {c.sourceCount} {tr("Quelle(n)", "source(s)")}</p>}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">{tr("Je Domain", "By domain")}</h3>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[520px] text-left text-sm" data-testid="report-domains">
            <thead>
              <tr className="border-b border-border bg-surface text-xs text-subtle">
                <th className="px-3 py-2">{tr("Domain", "Domain")}</th>
                <th className="px-3 py-2 text-right">{tr("Lernziele", "Objectives")}</th>
                <th className="px-3 py-2 text-right">{tr("Lektionen", "Lessons")}</th>
                <th className="px-3 py-2 text-right">{tr("Fragen", "Questions")}</th>
                <th className="px-3 py-2 text-right">{tr("Simulationen", "Simulations")}</th>
                <th className="px-3 py-2 text-right">{tr("Praxisbeispiele", "Hands-on")}</th>
              </tr>
            </thead>
            <tbody>
              {report.domains.map((d) => (
                <tr key={d.id} className="border-t border-border-subtle">
                  <td className="px-3 py-1.5 font-medium">{d.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.objectives}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.sections}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.questions}</td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", d.simulations === 0 && "text-faint")}>{d.simulations}</td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", d.practice === 0 && "text-faint")}>{d.practice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="improvements">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{tr("Verbesserungspotenzial", "Room for improvement")}</h3>
          <div className="ml-auto inline-flex gap-1 rounded-lg border border-border-subtle bg-surface-inset p-1" role="group" aria-label={tr("Filter", "Filter")}>
            {(["all", "high", "medium", "low"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("h-8 rounded-md px-2.5 text-[13px] font-medium", filter === f ? "bg-surface-2 text-foreground" : "text-subtle hover:text-foreground")}>
                {f === "all" ? `${tr("Alle", "All")} (${report.improvements.length})` : `${sev[f]} (${counts[f]})`}
              </button>
            ))}
          </div>
        </div>
        <details className="mb-3 rounded-2xl border border-border bg-surface p-4" data-testid="batch-quality">
          <summary className="cursor-pointer text-sm font-semibold">{tr("Alle von der KI bearbeiten lassen", "Let the AI handle all of them")}</summary>
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-sm text-subtle">{tr("Welche Punkte soll die KI bearbeiten?", "Which items should the AI handle?")}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {BATCH_LABELS.map((l) => {
                const n = report.improvements.filter((i) => i.kind === l.kind).length;
                return (
                  <label key={l.kind} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={batchKinds.includes(l.kind)}
                      onChange={(e) => setBatchKinds((cur) => (e.target.checked ? [...cur, l.kind] : cur.filter((k) => k !== l.kind)))}
                    />
                    <span>{tr(l.de, l.en)} <span className="text-faint">({n})</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <AiBatchPanel
            kind="quality"
            certificationId={certId}
            locale={locale}
            title={tr("Qualitätsbericht abarbeiten", "Work through the quality report")}
            description={tr("Die KI bearbeitet die gewählten Punkte nacheinander (höchstens 100 je Lauf) und übernimmt die Ergebnisse. Vorher wird der Kursstand automatisch gemerkt.", "The AI works through the selected items one after another (at most 100 per run) and applies the results. The course state is saved automatically first.")}
            startLabel={tr("Schätzen und starten …", "Estimate and start …")}
            params={{ kinds: batchKinds, maxItems: 100 }}
            disabled={batchKinds.length === 0}
            onFinished={() => void load()}
          />
        </details>
        {shown.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-subtle">{tr("Nichts gefunden. Das ist ein gutes Zeichen.", "Nothing found. That's a good sign.")}</p>}
        <ul className="flex flex-col gap-1.5">
          {shown.map((i) => {
            const ai = aiActionFor(i);
            return (
              <li key={i.id} data-testid="improvement">
                <div className="flex items-stretch gap-1.5">
                  <button type="button" disabled={!i.objectiveId} onClick={() => i.objectiveId && onOpen({ objectiveId: i.objectiveId, sectionId: i.sectionId })} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-left text-sm enabled:hover:bg-surface-2">
                    <Badge tone={TONE[i.severity]} className="mt-0.5 shrink-0">{sev[i.severity]}</Badge>
                    <span className="min-w-0">{i.text[locale]}</span>
                  </button>
                  {ai && (
                    <button
                      type="button"
                      onClick={() => (i.kind === "missing_objective" ? setMissingOpen(missingOpen === i.id ? null : i.id) : i.objectiveId && onOpen({ objectiveId: i.objectiveId, sectionId: i.sectionId, ai }))}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface px-2.5 text-xs font-medium text-violet hover:bg-surface-2"
                      title={AI_ACTION_LABELS[ai][locale]}
                      data-testid="improvement-ai"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{AI_ACTION_LABELS[ai][locale]}</span>
                      <span className="sr-only sm:hidden">{AI_ACTION_LABELS[ai][locale]}</span>
                    </button>
                  )}
                </div>
                {missingOpen === i.id && i.missing && (
                  <MissingObjective
                    certId={certId}
                    locale={locale}
                    code={i.missing.code}
                    title={i.missing.title}
                    domains={report.domains}
                    suggestedDomainId={i.missing.domainId}
                    onClose={() => setMissingOpen(null)}
                    onCreated={(created, msg) => {
                      setMissingOpen(null);
                      setMessage(msg);
                      onObjectiveCreated({ objectiveId: created.objectiveId, sectionId: created.sectionIds[0] ?? null });
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {report.improvements.length >= 300 && <p className="mt-2 text-xs text-faint">{tr("Die ersten 300 Einträge, nach Wichtigkeit sortiert.", "The first 300 entries, sorted by importance.")}</p>}
      </section>

      <section className="grid gap-3 lg:grid-cols-2" data-testid="batch-backfills">
        <AiBatchPanel
          kind="simulations"
          certificationId={certId}
          locale={locale}
          title={tr("Simulationen ergänzen", "Add simulations")}
          description={tr("Ergänzt in allen Lektionen ohne Simulation eine interaktive Übung, wo sich das Thema eignet. Der Lektionstext bleibt unverändert.", "Adds an interactive exercise to every lesson without a simulation where the topic suits it. The lesson text stays as it is.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
          onFinished={() => void load()}
        />
        <AiBatchPanel
          kind="concepts"
          certificationId={certId}
          locale={locale}
          title={tr("Konzepte und Abfragen ergänzen", "Add concepts and probes")}
          description={tr("Ordnet den Fragen Konzepte zu und erzeugt Abfragevarianten für die Wiederholungsplanung (Selbsteinschätzung). Für Kurse, die davor entstanden sind.", "Tags questions with concepts and creates probe variants for review scheduling (self-assessment). For courses created before this feature.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="variants"
          certificationId={certId}
          locale={locale}
          title={tr("Varianten für die Wiederholung ergänzen", "Add review variants")}
          description={tr("Erzeugt je Frage mindestens zwei Varianten (anderer Kontext, gleiches Wissen), damit die Wiederholung nicht dieselbe Frage wiederholt.", "Creates at least two variants per question (different context, same knowledge) so reviews do not repeat the same question.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="explanations"
          certificationId={certId}
          locale={locale}
          title={tr("Alternativerklärungen für den Verstehens-Modus", "Alternative explanations for understanding mode")}
          description={tr("Erzeugt je Lernziel ein durchgerechnetes Beispiel, ein Lückenbeispiel und eine Analogie als Entwurf. Gezeigt werden sie erst nach deiner Freigabe in der Werkstatt.", "Creates a worked example, a gapped example and an analogy per objective as drafts. They are only shown after you approve them in the workshop.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="prerequisites"
          certificationId={certId}
          locale={locale}
          title={tr("Voraussetzungen zwischen Konzepten vorschlagen", "Suggest prerequisites between concepts")}
          description={tr("Schlägt vor, welches Konzept auf welchem aufbaut (Brücke im Verstehens-Modus, Bezug beim Einweben). Nur Entwürfe bis zur Freigabe; setzt Konzepte voraus (siehe oben).", "Suggests which concept builds on which (bridge in understanding mode, link for woven reviews). Drafts until approved; needs concepts (see above).")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="formats"
          certificationId={certId}
          locale={locale}
          title={tr("Formatfragen ergänzen", "Add format questions")}
          description={tr("Ergänzt für Lernziele, die nur Auswahlfragen haben, je zwei Fragen mit Reihenfolge, Kurzantwort oder Zuordnung.", "Adds two questions with ordering, short answer or matching for objectives that only have multiple-choice questions.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="rationales"
          certificationId={certId}
          locale={locale}
          title={tr("Begründungen zu falschen Antworten ergänzen", "Add reasons for wrong answers")}
          description={tr("Erzeugt für Fragen, bei denen eine falsche Option noch keine Begründung hat, kurze Begründungen. Vorhandene werden nie überschrieben.", "Creates short reasons for questions where a wrong option has none yet. Existing ones are never overwritten.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="blocks"
          certificationId={certId}
          locale={locale}
          title={tr("Lernblöcke in Lektionen einfügen", "Add learning blocks to lessons")}
          description={tr("Fügt in Lektionen ganz ohne Hinweise, Terminal- oder Praxisbeispiele solche Blöcke ein. Der Text bleibt, die Änderung wird abgelehnt, wenn Sätze fehlen.", "Adds notes, terminal and practice blocks to lessons that have none. The text stays; the change is rejected if sentences go missing.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
        <AiBatchPanel
          kind="possible"
          certificationId={certId}
          locale={locale}
          title={tr("„Was damit möglich ist“ ergänzen", "Add “what this makes possible”")}
          description={tr("Ergänzt in Lektionen den Hinweis „Was damit möglich ist“ und Textverweise in Simulationen. Vorher wird der Kursstand gemerkt.", "Adds the “what this makes possible” note to lessons and text references to simulations. The course state is saved first.")}
          startLabel={tr("Schätzen und starten …", "Estimate and start …")}
        />
      </section>
    </div>
  );
}
