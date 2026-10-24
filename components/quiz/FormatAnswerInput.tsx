"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { RichText } from "@/components/RichText";
import type { AnswerPayload, AnswerPrompt, AnswerSolution } from "@/lib/questions/answer-formats";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Startzustand der Eingabe: Reihenfolge wie dargestellt, sonst leer. */
export function initialDraft(prompt: AnswerPrompt): AnswerPayload {
  if (prompt.format === "ordering") return { kind: "ordering", order: prompt.steps.map((s) => s.id) };
  if (prompt.format === "short_answer") return { kind: "short_answer", text: "" };
  return { kind: "matching", matches: {} };
}

/** Ist die Eingabe vollständig genug, um sie abzugeben? */
export function isDraftComplete(prompt: AnswerPrompt, draft: AnswerPayload | null): boolean {
  if (!draft) return false;
  if (prompt.format === "ordering") return draft.kind === "ordering" && draft.order.length === prompt.steps.length;
  if (prompt.format === "short_answer") return draft.kind === "short_answer" && draft.text.trim().length > 0;
  return draft.kind === "matching" && prompt.left.every((l) => Boolean(draft.matches[l.id]));
}

const fieldClass = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";

/**
 * Eingabe für die neuen Antwortformate. Bedienbar ohne Maus: Reihenfolge mit Hoch/Runter-Knöpfen (kein Ziehen nötig), Kurzantwort als
 * Textfeld, Zuordnung mit einer Auswahl je Begriff.
 */
export function FormatAnswerInput({ prompt, value, onChange, disabled, locale }: { prompt: AnswerPrompt; value: AnswerPayload; onChange: (next: AnswerPayload) => void; disabled?: boolean; locale: Locale }) {
  const de = locale === "de";
  if (prompt.format === "ordering" && value.kind === "ordering") {
    const byId = new Map(prompt.steps.map((s) => [s.id, s]));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= value.order.length) return;
      const next = [...value.order];
      [next[i], next[j]] = [next[j], next[i]];
      onChange({ kind: "ordering", order: next });
    };
    return (
      <div data-testid="answer-ordering">
        <p className="mb-2 text-sm text-subtle">{de ? "Bringe die Schritte in die richtige Reihenfolge." : "Put the steps in the correct order."}</p>
        <ol className="flex flex-col gap-2">
          {value.order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5" data-testid="ordering-step">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-control font-mono text-xs font-semibold" aria-hidden="true">{i + 1}</span>
              <span className="flex-1 text-base">
                <RichText text={byId.get(id)?.text[locale] ?? ""} inline />
              </span>
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`${de ? "Nach oben" : "Move up"}: ${byId.get(id)?.text[locale] ?? ""}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-control hover:bg-surface-2 disabled:opacity-40" data-testid="ordering-up">
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" disabled={disabled || i === value.order.length - 1} onClick={() => move(i, 1)} aria-label={`${de ? "Nach unten" : "Move down"}: ${byId.get(id)?.text[locale] ?? ""}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-control hover:bg-surface-2 disabled:opacity-40" data-testid="ordering-down">
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (prompt.format === "short_answer" && value.kind === "short_answer") {
    return (
      <div data-testid="answer-short">
        <label className="mb-2 block text-sm text-subtle" htmlFor="short-answer-input">{de ? "Deine Antwort (kurz, z. B. Befehl, Port oder Begriff)" : "Your answer (short, e.g. a command, port or term)"}</label>
        <input id="short-answer-input" type="text" value={value.text} disabled={disabled} maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => onChange({ kind: "short_answer", text: e.target.value })} className={cn(fieldClass, "font-mono")} data-testid="short-answer-input" />
      </div>
    );
  }
  if (prompt.format === "matching" && value.kind === "matching") {
    return (
      <div data-testid="answer-matching">
        <p className="mb-2 text-sm text-subtle">{de ? "Ordne jedem Begriff die passende Aussage zu." : "Match each term with the fitting statement."}</p>
        <ul className="flex flex-col gap-3">
          {prompt.left.map((l) => (
            <li key={l.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:gap-3" data-testid="matching-row">
              <span className="font-medium sm:w-1/3"><RichText text={l.text[locale]} inline /></span>
              <select value={value.matches[l.id] ?? ""} disabled={disabled} onChange={(e) => onChange({ kind: "matching", matches: { ...value.matches, [l.id]: e.target.value } })} aria-label={`${de ? "Zuordnung für" : "Match for"} ${l.text[locale]}`} className={cn(fieldClass, "sm:flex-1")} data-testid="matching-select">
                <option value="">{de ? "Bitte wählen …" : "Please choose …"}</option>
                {prompt.right.map((r) => (
                  <option key={r.id} value={r.id}>{r.text[locale]}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

/** Die richtige Lösung nach dem Aufdecken. */
export function SolutionView({ solution, locale }: { solution: AnswerSolution; locale: Locale }) {
  const de = locale === "de";
  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm" data-testid="answer-solution">
      <p className="mb-1 text-xs font-semibold">{de ? "Richtig wäre:" : "Correct would be:"}</p>
      {solution.format === "ordering" && (
        <ol className="list-decimal pl-5">
          {solution.steps.map((s) => (
            <li key={s.id}>{s.text[locale]}</li>
          ))}
        </ol>
      )}
      {solution.format === "short_answer" && <p className="font-mono">{solution.accepted.join("  ·  ")}</p>}
      {solution.format === "matching" && (
        <ul className="flex flex-col gap-0.5">
          {solution.pairs.map((p) => (
            <li key={p.id}>
              <strong>{p.left[locale]}</strong> → {p.right[locale]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
