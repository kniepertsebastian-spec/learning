"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ACCEPTED_ANSWERS, MAX_MATCHING_PAIRS, MAX_ORDERING_STEPS, type AnswerData, type MatchingData, type OrderingData, type ShortAnswerData } from "@/lib/questions/answer-formats";
import { cn } from "@/lib/cn";
import { inputCls, textareaCls, type L, type Lang } from "./shared";

export type FormatKind = "ordering" | "short_answer" | "matching";

const empty = (): L => ({ de: "", en: "" });

/** Leere Lösungsdaten für ein neues Format (Mindestzahl an Zeilen schon da). */
export function emptyAnswerData(format: FormatKind): AnswerData {
  if (format === "ordering") return { steps: [1, 2, 3].map((n) => ({ id: `s${n}`, text: empty() })) };
  if (format === "short_answer") return { accepted: [""] };
  return { pairs: [1, 2, 3].map((n) => ({ id: `p${n}`, left: empty(), right: empty() })) };
}

const nextId = (prefix: string, ids: string[]) => {
  let n = ids.length + 1;
  while (ids.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/**
 * Lösungsdaten einer Frage mit Reihenfolge, Kurzantwort oder Zuordnung bearbeiten. Texte gelten für die gewählte Sprache
 * (`setL` kennt den Schalter „Beide Sprachen gleich“); die akzeptierten Antworten der Kurzantwort sind sprachunabhängig.
 */
export function FormatDataEditor({ format, data, onChange, lang, setL, tr }: { format: FormatKind; data: AnswerData; onChange: (next: AnswerData) => void; lang: Lang; setL: (cur: L, value: string) => L; tr: (de: string, en: string) => string }) {
  if (format === "ordering") {
    const d = data as OrderingData;
    const set = (steps: OrderingData["steps"]) => onChange({ steps });
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return;
      const next = [...d.steps];
      [next[i], next[j]] = [next[j], next[i]];
      set(next);
    };
    return (
      <fieldset className="flex flex-col gap-2" data-testid="format-editor-ordering">
        <legend className="mb-1 text-sm font-medium">{tr("Schritte in der RICHTIGEN Reihenfolge", "Steps in the CORRECT order")}</legend>
        {d.steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center font-mono text-xs text-subtle">{i + 1}</span>
            <input className={inputCls} value={s.text[lang]} onChange={(e) => set(d.steps.map((x, k) => (k === i ? { ...x, text: setL(x.text, e.target.value) } : x)))} placeholder={tr("Schritt", "Step")} data-testid="format-step-text" />
            <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr("Nach oben", "Move up")}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
            <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === d.steps.length - 1} aria-label={tr("Nach unten", "Move down")}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
            <Button size="sm" variant="ghost" onClick={() => set(d.steps.filter((_, k) => k !== i))} disabled={d.steps.length <= 2} aria-label={tr("Schritt entfernen", "Remove step")}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" className="self-start" onClick={() => set([...d.steps, { id: nextId("s", d.steps.map((s) => s.id)), text: empty() }])} disabled={d.steps.length >= MAX_ORDERING_STEPS} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />} data-testid="format-add-step">{tr("Schritt hinzufügen", "Add step")}</Button>
        <p className="text-xs text-faint">{tr("Lernende sehen die Schritte gemischt. Nur Abläufe mit genau einer sinnvollen Reihenfolge eignen sich.", "Learners see the steps shuffled. Only use sequences with exactly one sensible order.")}</p>
      </fieldset>
    );
  }
  if (format === "short_answer") {
    const d = data as ShortAnswerData;
    return (
      <div className="flex flex-col gap-2" data-testid="format-editor-short">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{tr("Akzeptierte Antworten (eine pro Zeile)", "Accepted answers (one per line)")}</span>
          <textarea className={cn(textareaCls, "min-h-20")} value={d.accepted.join("\n")} onChange={(e) => onChange({ ...d, accepted: e.target.value.split("\n").slice(0, MAX_ACCEPTED_ANSWERS) })} data-testid="format-accepted" />
          <span className="mt-1 block text-xs text-faint">{tr("Groß-/Kleinschreibung, Leerzeichen am Rand und Anführungszeichen werden ignoriert. Gleichwertige Schreibweisen und Synonyme einzeln eintragen.", "Case, surrounding spaces and quotes are ignored. List equivalent spellings and synonyms separately.")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(d.caseSensitive)} onChange={(e) => onChange({ ...d, caseSensitive: e.target.checked || undefined })} />
          {tr("Groß-/Kleinschreibung beachten", "Case sensitive")}
        </label>
      </div>
    );
  }
  const d = data as MatchingData;
  const set = (pairs: MatchingData["pairs"]) => onChange({ pairs });
  return (
    <fieldset className="flex flex-col gap-2" data-testid="format-editor-matching">
      <legend className="mb-1 text-sm font-medium">{tr("Paare (Begriff ↔ passende Aussage)", "Pairs (term ↔ matching statement)")}</legend>
      {d.pairs.map((p, i) => (
        <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={inputCls} value={p.left[lang]} onChange={(e) => set(d.pairs.map((x, k) => (k === i ? { ...x, left: setL(x.left, e.target.value) } : x)))} placeholder={tr("Begriff", "Term")} data-testid="format-pair-left" />
          <input className={inputCls} value={p.right[lang]} onChange={(e) => set(d.pairs.map((x, k) => (k === i ? { ...x, right: setL(x.right, e.target.value) } : x)))} placeholder={tr("Passende Aussage", "Matching statement")} data-testid="format-pair-right" />
          <Button size="sm" variant="ghost" onClick={() => set(d.pairs.filter((_, k) => k !== i))} disabled={d.pairs.length <= 2} aria-label={tr("Paar entfernen", "Remove pair")}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" className="self-start" onClick={() => set([...d.pairs, { id: nextId("p", d.pairs.map((x) => x.id)), left: empty(), right: empty() }])} disabled={d.pairs.length >= MAX_MATCHING_PAIRS} iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />} data-testid="format-add-pair">{tr("Paar hinzufügen", "Add pair")}</Button>
      <p className="text-xs text-faint">{tr("Die rechte Seite wird gemischt angezeigt. Jede Aussage darf nur einmal vorkommen.", "The right side is shown shuffled. Each statement may appear only once.")}</p>
    </fieldset>
  );
}
