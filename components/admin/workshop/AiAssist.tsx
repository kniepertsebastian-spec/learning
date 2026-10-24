"use client";

import { Check, PencilLine, Sparkles, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { AiProposal } from "@/lib/server/course-editor/ai";
import { AI_ACTION_LABELS, MAX_INSTRUCTION, MAX_NEW_QUESTIONS, type AiAction, type AiEstimate } from "@/lib/workshop-ai";
import { api, Field, inputCls, Problems, textareaCls, useTr, type Lang } from "./shared";

export type AiTarget = { target: "section" | "question" | "objective"; id: string } | { target: "missing-objective"; domainId: string; code: string; title: string };
export type AcceptResult = { checkpoint?: string | null; translation?: "started" | "running" | "not_needed" | "off" };

export function formatUsd(usd: number | null, locale: Lang): string {
  if (usd === null) return locale === "de" ? "Preis nicht hinterlegt" : "price not configured";
  if (usd > 0 && usd < 0.01) return "< 0,01 $".replace(",", locale === "de" ? "," : ".");
  return usd.toLocaleString(locale === "de" ? "de-DE" : "en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * „Mit KI nachbessern“ (roadmap3.md, Schritt 3): Aktion wählen, optional eine Anweisung, Kostenschätzung vorab, dann
 * einen Vorschlag erzeugen. Gespeichert wird hier nichts; den Vorschlag zeigt der Editor zum Vergleichen an.
 */
export function AiAssist({
  certId,
  locale,
  target,
  actions,
  initialAction,
  disabled,
  onProposal,
}: {
  certId: string;
  locale: Lang;
  target: AiTarget;
  actions: AiAction[];
  initialAction?: AiAction | null;
  /** z. B. ungespeicherte Änderungen: ein Vorschlag würde darauf nicht aufbauen. */
  disabled?: string | null;
  onProposal: (proposal: AiProposal) => void;
}) {
  const tr = useTr(locale);
  const [open, setOpen] = React.useState(Boolean(initialAction));
  const [action, setAction] = React.useState<AiAction>(initialAction && actions.includes(initialAction) ? initialAction : actions[0]);
  const [instruction, setInstruction] = React.useState("");
  const [count, setCount] = React.useState(4);
  const [estimates, setEstimates] = React.useState<AiEstimate[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const panel = React.useRef<HTMLElement>(null);
  // Aus dem Qualitätsbericht geöffnet: gleich zum Panel springen (auf dem Handy steht es sonst weit unten).
  React.useEffect(() => {
    if (initialAction) panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [initialAction]);

  const targetKey = JSON.stringify(target);
  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const t = JSON.parse(targetKey) as AiTarget;
      const r = await api<{ estimates: AiEstimate[] }>(`/api/admin/certifications/${certId}/workshop/ai/estimate`, { method: "POST", body: { target: t.target, id: "id" in t ? t.id : undefined, count } });
      if (r.ok) setEstimates(r.data.estimates);
    })();
  }, [open, certId, targetKey, count]);

  const est = (a: AiAction) => estimates?.find((e) => e.action === a);
  const needsInstruction = action === "custom" && !instruction.trim();

  async function generate() {
    setBusy(true);
    setError(null);
    const body = { ...target, action, instruction: instruction.trim() || undefined, ...(action === "add_questions" || action === "add_format_questions" ? { count } : {}) };
    const r = await api<{ proposal: AiProposal }>(`/api/admin/certifications/${certId}/workshop/ai`, { method: "POST", body });
    setBusy(false);
    if (!r.ok) return setError(r.problems?.length ? `${r.error} ${r.problems.join(" ")}` : r.error);
    onProposal(r.data.proposal);
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)} iconLeft={<Sparkles className="h-4 w-4" aria-hidden="true" />} data-testid="ai-open">
        {tr("Mit KI nachbessern", "Improve with AI")}
      </Button>
    );
  }

  return (
    <section ref={panel} className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-accent-border bg-accent-soft/40 p-4" data-testid="ai-assist">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{tr("Mit KI nachbessern", "Improve with AI")}</h3>
        <button type="button" className="ml-auto rounded p-1 text-subtle hover:bg-surface-2" onClick={() => setOpen(false)} aria-label={tr("Schließen", "Close")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {actions.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr("Aktion", "Action")}>
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={action === a}
              onClick={() => setAction(a)}
              className={cn("flex flex-col gap-0.5 rounded-xl border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-2", action === a ? "border-accent-border ring-1 ring-accent-border" : "border-border-subtle")}
              data-testid={`ai-action-${a}`}
            >
              <span className="font-medium">{AI_ACTION_LABELS[a][locale]}</span>
              <span className="text-xs text-subtle">{AI_ACTION_LABELS[a].hint[locale]}</span>
            </button>
          ))}
        </div>
      )}
      {(action === "add_questions" || action === "add_format_questions") && (
        <Field label={tr("Anzahl neuer Fragen", "Number of new questions")} className="max-w-48">
          <input className={inputCls} type="number" min={1} max={MAX_NEW_QUESTIONS} value={count} onChange={(e) => setCount(Math.min(MAX_NEW_QUESTIONS, Math.max(1, Number(e.target.value) || 1)))} data-testid="ai-count" />
        </Field>
      )}
      <Field label={action === "custom" ? tr("Anweisung", "Instruction") : tr("Zusätzliche Anweisung (optional)", "Additional instruction (optional)")} hint={tr("z. B. „Beispiel aus der Pflege statt aus dem Handel“ oder „Abschnitt zu X kürzen“", "e.g. “use an example from healthcare instead of retail” or “shorten the part about X”")}>
        <textarea className={cn(textareaCls, "min-h-16 font-sans")} value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={MAX_INSTRUCTION} data-testid="ai-instruction" />
      </Field>
      {error && <Problems title={error} />}
      {disabled && <p className="text-xs text-warning-text">{disabled}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void generate()} disabled={busy || needsInstruction || Boolean(disabled)} iconLeft={<Sparkles className={cn("h-4 w-4", busy && "animate-pulse")} aria-hidden="true" />} data-testid="ai-generate">
          {busy ? tr("Die KI arbeitet …", "AI is working …") : tr("Vorschlag erzeugen", "Create proposal")}
        </Button>
        <span className="text-xs text-subtle" data-testid="ai-estimate">
          {est(action) ? `${tr("Geschätzte Kosten", "Estimated cost")}: ${formatUsd(est(action)!.usd, locale)}` : tr("Schätze Kosten …", "Estimating cost …")}
        </span>
      </div>
      <p className="text-xs text-faint">
        {busy
          ? tr("Das dauert meist 20 bis 90 Sekunden. Du bekommst einen Vorschlag zum Vergleichen, gespeichert wird noch nichts.", "This usually takes 20 to 90 seconds. You get a proposal to compare; nothing is saved yet.")
          : tr("Du bekommst einen Vorschlag zum Vergleichen. Erst wenn du ihn übernimmst, wird gespeichert; vorher merkt sich die Werkstatt den ganzen Kurs.", "You get a proposal to compare. Only when you accept it is it saved; before that the workshop saves a checkpoint of the whole course.")}
      </p>
    </section>
  );
}

/**
 * Rahmen eines KI-Vorschlags: was sich geändert hat, Kosten, Hinweise, und Übernehmen / Anpassen / Verwerfen. Den Inhalt
 * (Unterschied, Vorschau) liefert der jeweilige Editor als children.
 */
export function ProposalReview({
  locale,
  proposal,
  translated,
  hasReports,
  busy,
  onAccept,
  onAdjust,
  onDiscard,
  acceptLabel,
  children,
}: {
  locale: Lang;
  proposal: AiProposal;
  /** Gibt es schon eine Übersetzung, die danach veraltet ist? */
  translated: boolean;
  hasReports?: boolean;
  busy?: boolean;
  onAccept: (resolveReports: boolean) => void;
  onAdjust?: () => void;
  onDiscard: () => void;
  acceptLabel?: string;
  children: React.ReactNode;
}) {
  const tr = useTr(locale);
  const [resolve, setResolve] = React.useState(true);
  const changes = "changes" in proposal ? proposal.changes : null;
  const repaired = "repaired" in proposal && proposal.repaired;
  const other = proposal.locale === "de" ? tr("Englisch", "English") : tr("Deutsch", "German");
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent-border bg-surface p-4" data-testid="ai-proposal">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {tr("KI-Vorschlag", "AI proposal")}
        </Badge>
        <span className="text-sm font-semibold">{AI_ACTION_LABELS[proposal.action][locale]}</span>
        <span className="ml-auto text-xs text-subtle" data-testid="ai-cost">
          {tr("Kosten", "Cost")}: {formatUsd(proposal.costUsd, locale)}
          {proposal.totalCostUsd !== null && ` · ${tr("KI-Nachbesserung in diesem Kurs bisher", "AI edits in this course so far")}: ${formatUsd(proposal.totalCostUsd, locale)}`}
        </span>
      </div>
      {changes && <p className="text-sm" data-testid="ai-changes">{changes}</p>}
      {repaired && <Problems tone="warning" title={tr("Einige Lernblöcke der KI waren fehlerhaft und wurden entfernt oder repariert. Bitte prüfe den Vorschlag besonders genau.", "Some of the AI's learning blocks were invalid and were removed or repaired. Please check the proposal carefully.")} />}
      {translated && <p className="text-xs text-subtle">{tr(`Die KI schreibt in der Kurssprache. ${other} wird danach als veraltet markiert und automatisch neu übersetzt; bis dahin sehen Lernende die bisherige Übersetzung.`, `The AI writes in the course language. ${other} is then marked as outdated and re-translated automatically; until then learners see the previous translation.`)}</p>}
      {children}
      {hasReports && proposal.action === "fix_reports" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} data-testid="ai-resolve-reports" />
          {tr("Offene Meldungen danach als erledigt schließen", "Close the open reports afterwards")}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAccept(resolve)} disabled={busy} iconLeft={<Check className="h-4 w-4" aria-hidden="true" />} data-testid="ai-accept">
          {acceptLabel ?? tr("Übernehmen", "Accept")}
        </Button>
        {onAdjust && (
          <Button size="sm" variant="secondary" onClick={onAdjust} disabled={busy} iconLeft={<PencilLine className="h-4 w-4" aria-hidden="true" />} data-testid="ai-adjust">
            {tr("Anpassen", "Adjust")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy} iconLeft={<X className="h-4 w-4" aria-hidden="true" />} data-testid="ai-discard">
          {tr("Verwerfen", "Discard")}
        </Button>
      </div>
    </section>
  );
}

/** Meldung nach dem Übernehmen: gemerkter Stand und was mit der anderen Sprache passiert. */
export function acceptMessage(r: AcceptResult, tr: (de: string, en: string) => string): string {
  const parts = [tr("Übernommen, in den Versionen mit Herkunft „KI“.", "Accepted, in the history with origin “AI”.")];
  if (r.checkpoint) parts.push(tr(`Gemerkter Stand: „${r.checkpoint}“.`, `Checkpoint: “${r.checkpoint}”.`));
  if (r.translation === "started" || r.translation === "running") parts.push(tr("Die Übersetzung wird nachgezogen.", "The translation is being updated."));
  if (r.translation === "off") parts.push(tr("Die andere Sprache ist als veraltet markiert; die automatische Übersetzung ist ausgeschaltet.", "The other language is marked as outdated; automatic translation is turned off."));
  return parts.join(" ");
}
