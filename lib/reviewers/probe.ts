/**
 * Probe-Review (roadmap_pruefer Phase 5): reine Regeln. Geprüft wird, ob jemand gut PRÜFEN kann: Der Satz enthält Fragen mit von Menschen
 * festgelegten Fehlern; die Auswertung zählt gefundene Fehler und Fehlalarme, ohne KI.
 */
import type { ProbeErrorType } from "@/lib/server/db/schema";

export const PROBE_ERROR_TYPES: readonly ProbeErrorType[] = ["wrong_key", "two_valid", "outdated", "misleading", "explanation_contradicts"];
export const PROBE_ERROR_LABEL: Record<ProbeErrorType, { de: string; en: string }> = {
  wrong_key: { de: "Falscher Lösungsschlüssel", en: "Wrong answer key" },
  two_valid: { de: "Zwei vertretbare Antworten", en: "Two defensible answers" },
  outdated: { de: "Veralteter Prüfungsstand", en: "Outdated exam content" },
  misleading: { de: "Irreführende Formulierung", en: "Misleading wording" },
  explanation_contradicts: { de: "Erklärung widerspricht der Lösung", en: "Explanation contradicts the answer" },
};

export const MIN_ITEMS = 15;
export const MAX_ITEMS = 20;
export const MIN_PLANTED = 4;
export const MAX_PLANTED = 5;
/** Anteil der eingebauten Fehler, den man finden muss (4 von 5), und erlaubte Fehlalarme. */
export const REQUIRED_FOUND_SHARE = 0.8;
export const MAX_FALSE_ALARMS = 2;
export const RETRY_AFTER_DAYS = 30;
export const MAX_REPORT_TEXT = 500;

export interface ProbeItemDraft {
  question: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  explanation: string;
  plantedError: { type: ProbeErrorType; note: string } | null;
}

/** Probleme eines Satzes (leer = darf aktiviert werden). */
export function validateProbeSet(items: ProbeItemDraft[]): string[] {
  const problems: string[] = [];
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) problems.push(`Ein Satz braucht ${MIN_ITEMS} bis ${MAX_ITEMS} Fragen (aktuell ${items.length}).`);
  const planted = items.filter((i) => i.plantedError).length;
  if (planted < MIN_PLANTED || planted > MAX_PLANTED) problems.push(`Es braucht ${MIN_PLANTED} bis ${MAX_PLANTED} eingebaute Fehler (aktuell ${planted}).`);
  items.forEach((item, i) => {
    const n = i + 1;
    if (!item.question.trim() || !item.explanation.trim()) problems.push(`Frage ${n}: Fragetext und Erklärung sind Pflicht.`);
    if (item.options.length !== 4 || item.options.some((o) => !o.text.trim())) problems.push(`Frage ${n}: genau vier Antwortoptionen mit Text.`);
    else if (item.options.filter((o) => o.isCorrect).length !== 1) problems.push(`Frage ${n}: genau eine Option muss als richtig markiert sein.`);
    if (item.plantedError && (!PROBE_ERROR_TYPES.includes(item.plantedError.type) || !item.plantedError.note.trim())) problems.push(`Frage ${n}: Fehlertyp und Notiz zum eingebauten Fehler sind Pflicht.`);
  });
  return problems;
}

export interface ProbeResult {
  found: number;
  plantedTotal: number;
  falseAlarms: number;
  passed: boolean;
}

/** Wie viele eingebaute Fehler gefunden sein müssen (4 von 5; bei 4 eingebauten Fehlern alle vier). */
export const requiredFound = (plantedTotal: number) => Math.ceil(plantedTotal * REQUIRED_FOUND_SHARE);

/** Regelbasierte Auswertung. Gemeldet wird je Frage höchstens einmal; eine Meldung zu einer fehlerfreien Frage ist ein Fehlalarm. */
export function evaluateProbe(items: Array<{ id: string; planted: boolean }>, reportedItemIds: string[]): ProbeResult {
  const reported = new Set(reportedItemIds);
  const plantedTotal = items.filter((i) => i.planted).length;
  const found = items.filter((i) => i.planted && reported.has(i.id)).length;
  const falseAlarms = items.filter((i) => !i.planted && reported.has(i.id)).length;
  return { found, plantedTotal, falseAlarms, passed: plantedTotal > 0 && found >= requiredFound(plantedTotal) && falseAlarms <= MAX_FALSE_ALARMS };
}

/** Frühester nächster Versuch: 30 Tage nach der Abgabe des letzten (nicht bestandenen) Versuchs. */
export function nextAttemptAllowedAt(lastSubmittedAt: Date): Date {
  return new Date(lastSubmittedAt.getTime() + RETRY_AFTER_DAYS * 86_400_000);
}
