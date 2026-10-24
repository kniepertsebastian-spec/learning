/**
 * Neue Antwortformate (roadmap_didaktik Phase 3.1): Reihenfolge, Kurzantwort und Zuordnung neben Auswahlfragen. Alles regelbasiert
 * auswertbar, das Rating bleibt binär (richtig oder falsch); Teilpunkte gibt es nur für die Anzeige. Reine Funktionen ohne Datenbank,
 * damit Server, Offline-Leser und Tests dieselben Regeln nutzen.
 */
import type { Localized } from "@/lib/types";

export const ANSWER_FORMATS = ["choice", "ordering", "short_answer", "matching"] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

/** Schritte in der RICHTIGEN Reihenfolge. */
export interface OrderingData {
  steps: Array<{ id: string; text: Localized<string> }>;
}
/** Akzeptierte Antworten, sprachneutral (Befehle, Ports, Ressourcentypen). Die erste ist die Anzeige-Antwort. */
export interface ShortAnswerData {
  accepted: string[];
  /** Standard: Groß-/Kleinschreibung egal. */
  caseSensitive?: boolean;
}
/** Paare Begriff ↔ Zweck; die Paar-ID dient auch als ID der rechten Seite. */
export interface MatchingData {
  pairs: Array<{ id: string; left: Localized<string>; right: Localized<string> }>;
}
export type AnswerData = OrderingData | ShortAnswerData | MatchingData;

/** Antwort der lernenden Person (bei Auswahlfragen bleibt es `selectedOptionId`). */
export type AnswerPayload =
  | { kind: "ordering"; order: string[] }
  | { kind: "short_answer"; text: string }
  | { kind: "matching"; matches: Record<string, string> };

export const MAX_ORDERING_STEPS = 8;
export const MAX_MATCHING_PAIRS = 8;
export const MAX_ACCEPTED_ANSWERS = 10;
export const MAX_SHORT_ANSWER_LENGTH = 200;

/** Vergleichsform einer Kurzantwort: Unicode vereinheitlicht, Ränder und umgebende Anführungszeichen/Backticks weg, Leerraum zusammengezogen. */
export function normalizeShortAnswer(text: string, caseSensitive = false): string {
  let value = text.normalize("NFKC").trim();
  value = value.replace(/^["'`„“”‚‘’]+|["'`„“”‚‘’]+$/g, "").trim().replace(/\s+/g, " ");
  return caseSensitive ? value : value.toLowerCase();
}

export interface Grade {
  correct: boolean;
  /** Anteil richtiger Teile (0 bis 1), nur zur Anzeige; das Rating bleibt binär. */
  partial: number;
}

export function gradeOrdering(data: OrderingData, order: string[]): Grade {
  const expected = data.steps.map((s) => s.id);
  const correct = order.length === expected.length && order.every((id, i) => id === expected[i]);
  const inPlace = expected.filter((id, i) => order[i] === id).length;
  return { correct, partial: expected.length ? inPlace / expected.length : 0 };
}

export function gradeShortAnswer(data: ShortAnswerData, text: string): Grade {
  const given = normalizeShortAnswer(text, data.caseSensitive);
  const correct = given.length > 0 && data.accepted.some((a) => normalizeShortAnswer(a, data.caseSensitive) === given);
  return { correct, partial: correct ? 1 : 0 };
}

export function gradeMatching(data: MatchingData, matches: Record<string, string>): Grade {
  const right = data.pairs.filter((p) => matches[p.id] === p.id).length;
  return { correct: right === data.pairs.length && data.pairs.length > 0, partial: data.pairs.length ? right / data.pairs.length : 0 };
}

/** Macht aus unbekannter Eingabe (API, Sync-Warteschlange) eine wohlgeformte Antwort oder null. Begrenzt Längen, damit nichts Unsinniges gespeichert wird. */
export function sanitizeAnswer(raw: unknown): AnswerPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  if (r.kind === "ordering" && Array.isArray(r.order) && r.order.length <= MAX_ORDERING_STEPS) {
    const order = r.order.map((v) => str(v, 100));
    return order.every((v): v is string => v !== null) ? { kind: "ordering", order } : null;
  }
  if (r.kind === "short_answer") {
    const text = str(r.text, MAX_SHORT_ANSWER_LENGTH);
    return text === null ? null : { kind: "short_answer", text };
  }
  if (r.kind === "matching" && r.matches && typeof r.matches === "object" && !Array.isArray(r.matches)) {
    const entries = Object.entries(r.matches as Record<string, unknown>);
    if (entries.length > MAX_MATCHING_PAIRS) return null;
    const matches: Record<string, string> = {};
    for (const [k, v] of entries) {
      const value = str(v, 100);
      if (value === null || k.length > 100) return null;
      matches[k] = value;
    }
    return { kind: "matching", matches };
  }
  return null;
}

/** Wertet eine Antwort aus. Passt Format und Antwort nicht zusammen, ist sie falsch. */
export function gradeAnswer(format: Exclude<AnswerFormat, "choice">, data: AnswerData, rawAnswer: AnswerPayload | null | undefined): Grade {
  const answer = sanitizeAnswer(rawAnswer);
  if (!answer || answer.kind !== format) return { correct: false, partial: 0 };
  if (format === "ordering") return gradeOrdering(data as OrderingData, answer.kind === "ordering" ? answer.order : []);
  if (format === "short_answer") return gradeShortAnswer(data as ShortAnswerData, answer.kind === "short_answer" ? answer.text : "");
  return gradeMatching(data as MatchingData, answer.kind === "matching" ? answer.matches : {});
}

/* ---------------------------------------------------------------- Darstellung */

/** Stabile Zufallszahl 0 bis 1 aus einem Text (Seed), damit Server und Client dieselbe Reihenfolge zeigen. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/** Deterministisch gemischt (Seed = Frage-ID und ggf. Session). Die Lösungsreihenfolge kommt nie unverändert heraus, wenn es mehr als einen Eintrag gibt. */
export function shuffled<T>(items: T[], seed: string): T[] {
  if (items.length < 2) return [...items];
  const next = seeded(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  const same = out.every((item, i) => item === items[i]);
  return same ? [...out.slice(1), out[0]] : out;
}

/** Was der Client vor der Antwort sieht (ohne Lösung). */
export type AnswerPrompt =
  | { format: "ordering"; steps: Array<{ id: string; text: Localized<string> }> }
  | { format: "short_answer" }
  | { format: "matching"; left: Array<{ id: string; text: Localized<string> }>; right: Array<{ id: string; text: Localized<string> }> };

export function buildPrompt(format: Exclude<AnswerFormat, "choice">, data: AnswerData, seed: string): AnswerPrompt {
  if (format === "ordering") return { format, steps: shuffled((data as OrderingData).steps, seed) };
  if (format === "short_answer") return { format };
  const pairs = (data as MatchingData).pairs;
  return { format, left: pairs.map((p) => ({ id: p.id, text: p.left })), right: shuffled(pairs.map((p) => ({ id: p.id, text: p.right })), seed) };
}

/** Lösung zur Anzeige nach dem Aufdecken. */
export type AnswerSolution =
  | { format: "ordering"; steps: Array<{ id: string; text: Localized<string> }> }
  | { format: "short_answer"; accepted: string[] }
  | { format: "matching"; pairs: Array<{ id: string; left: Localized<string>; right: Localized<string> }> };

export function buildSolution(format: Exclude<AnswerFormat, "choice">, data: AnswerData): AnswerSolution {
  if (format === "ordering") return { format, steps: (data as OrderingData).steps };
  if (format === "short_answer") return { format, accepted: (data as ShortAnswerData).accepted };
  return { format, pairs: (data as MatchingData).pairs };
}

/* ---------------------------------------------------------------- Prüfung der Lösungsdaten */

const bothLocales = (t: unknown): t is Localized<string> => !!t && typeof t === "object" && typeof (t as Localized<string>).de === "string" && typeof (t as Localized<string>).en === "string" && (t as Localized<string>).de.trim().length > 0 && (t as Localized<string>).en.trim().length > 0;

/** Probleme der Lösungsdaten eines Formats (leer = in Ordnung). Für Generierung, Werkstatt und Import. */
export function validateAnswerData(format: AnswerFormat, data: unknown): string[] {
  if (format === "choice") return data == null ? [] : ["Auswahlfragen haben keine zusätzlichen Lösungsdaten."];
  if (!data || typeof data !== "object") return ["Lösungsdaten fehlen."];
  const problems: string[] = [];
  if (format === "ordering") {
    const steps = (data as OrderingData).steps;
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > MAX_ORDERING_STEPS) return [`Eine Reihenfolge braucht 2 bis ${MAX_ORDERING_STEPS} Schritte.`];
    if (new Set(steps.map((s) => s.id)).size !== steps.length || steps.some((s) => typeof s.id !== "string" || !s.id)) problems.push("Die Schritte brauchen eindeutige IDs.");
    if (steps.some((s) => !bothLocales(s.text))) problems.push("Jeder Schritt braucht einen Text auf Deutsch und Englisch.");
    const texts = steps.map((s) => (bothLocales(s.text) ? s.text.de.trim().toLowerCase() : ""));
    if (new Set(texts).size !== texts.length) problems.push("Zwei Schritte haben denselben Text.");
  } else if (format === "short_answer") {
    const accepted = (data as ShortAnswerData).accepted;
    if (!Array.isArray(accepted) || accepted.length < 1 || accepted.length > MAX_ACCEPTED_ANSWERS) return [`Eine Kurzantwort braucht 1 bis ${MAX_ACCEPTED_ANSWERS} akzeptierte Antworten.`];
    if (accepted.some((a) => typeof a !== "string" || normalizeShortAnswer(a).length === 0 || a.length > MAX_SHORT_ANSWER_LENGTH)) problems.push(`Akzeptierte Antworten dürfen nicht leer und höchstens ${MAX_SHORT_ANSWER_LENGTH} Zeichen lang sein.`);
    else if (new Set(accepted.map((a) => normalizeShortAnswer(a, (data as ShortAnswerData).caseSensitive))).size !== accepted.length) problems.push("Zwei akzeptierte Antworten sind nach der Normalisierung gleich.");
  } else {
    const pairs = (data as MatchingData).pairs;
    if (!Array.isArray(pairs) || pairs.length < 2 || pairs.length > MAX_MATCHING_PAIRS) return [`Eine Zuordnung braucht 2 bis ${MAX_MATCHING_PAIRS} Paare.`];
    if (new Set(pairs.map((p) => p.id)).size !== pairs.length || pairs.some((p) => typeof p.id !== "string" || !p.id)) problems.push("Die Paare brauchen eindeutige IDs.");
    if (pairs.some((p) => !bothLocales(p.left) || !bothLocales(p.right))) problems.push("Jede Seite eines Paares braucht einen Text auf Deutsch und Englisch.");
    const rights = pairs.map((p) => (bothLocales(p.right) ? p.right.de.trim().toLowerCase() : ""));
    if (new Set(rights).size !== rights.length) problems.push("Zwei Paare haben dieselbe rechte Seite, die Zuordnung wäre nicht eindeutig.");
  }
  return problems;
}

/* ---------------------------------------------------------------- Übersetzbare Texte */

/** Die Texte der Lösungsdaten, die übersetzt werden müssen (Kurzantworten nicht: Befehle und Begriffe bleiben). Schlüssel: `step:<id>`, `left:<id>`, `right:<id>`. */
export function translatableAnswerTexts(format: AnswerFormat, data: AnswerData | null | undefined): Array<{ key: string; text: Localized<string> }> {
  if (!data || format === "choice") return [];
  if (format === "ordering") return (data as OrderingData).steps.map((s) => ({ key: `step:${s.id}`, text: s.text }));
  if (format === "matching") return (data as MatchingData).pairs.flatMap((p) => [{ key: `left:${p.id}`, text: p.left }, { key: `right:${p.id}`, text: p.right }]);
  return [];
}

/** Schreibt übersetzte Texte (Schlüssel wie oben) in das Feld der Zielsprache; alles andere bleibt unverändert. */
export function withTranslatedAnswerTexts(format: AnswerFormat, data: AnswerData, target: "de" | "en", translated: Record<string, string>): AnswerData {
  const pick = (key: string, cur: Localized<string>): Localized<string> => (key in translated ? { ...cur, [target]: translated[key] } : cur);
  if (format === "ordering") return { steps: (data as OrderingData).steps.map((s) => ({ ...s, text: pick(`step:${s.id}`, s.text) })) };
  if (format === "matching") return { pairs: (data as MatchingData).pairs.map((p) => ({ ...p, left: pick(`left:${p.id}`, p.left), right: pick(`right:${p.id}`, p.right) })) };
  return data;
}
