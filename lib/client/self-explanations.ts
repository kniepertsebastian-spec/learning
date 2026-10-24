"use client";

/**
 * Selbsterklärungen („Erkläre in einem Satz, warum …“) bleiben auf diesem Gerät: localStorage, nie ein Server, nie der Firmenbereich.
 * Sie werden nicht bewertet und fließen in kein Rating. Höchstens MAX_ENTRIES, die ältesten fallen zuerst weg.
 */
const STORAGE_KEY = "proofpath-self-explanations";
export const MAX_ENTRIES = 100;
export const MAX_LENGTH = 500;

export type SelfExplanationEntry = { text: string; at: string };

function read(): Record<string, SelfExplanationEntry> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, SelfExplanationEntry>) : {};
  } catch {
    return {};
  }
}

export function getSelfExplanation(key: string): SelfExplanationEntry | null {
  const entry = read()[key];
  return entry && typeof entry.text === "string" ? entry : null;
}

/** Speichert (oder ersetzt) die Erklärung zu einem Schlüssel; ohne verfügbaren Speicher passiert nichts. */
export function saveSelfExplanation(key: string, text: string, now = new Date()): void {
  const trimmed = text.trim().slice(0, MAX_LENGTH);
  if (!trimmed) return;
  try {
    const all = read();
    delete all[key];
    all[key] = { text: trimmed, at: now.toISOString() };
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[old];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // nicht persistierbar - die Erklärung war trotzdem sinnvoll
  }
}

export function clearSelfExplanations(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nichts zu tun
  }
}
