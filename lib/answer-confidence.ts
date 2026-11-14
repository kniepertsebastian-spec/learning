import type { AnswerConfidence } from "@/lib/types";

/** Erlaubte Werte der Selbsteinschätzung. Dieselben Werte stehen als Check-Constraint in der Datenbank (Migration 0117). */
export const ANSWER_CONFIDENCES = ["guessed", "unsure", "sure"] as const satisfies readonly AnswerConfidence[];

/**
 * Macht aus unbekannter Eingabe (API, Sync-Warteschlange) eine gültige Selbsteinschätzung oder null. Ein unbekannter Wert
 * entfällt, die Antwort selbst zählt weiter: sonst würde er am Check-Constraint scheitern und das Ereignis bei jedem Sync
 * erneut fehlschlagen.
 */
export function parseConfidence(raw: unknown): AnswerConfidence | null {
  return typeof raw === "string" && (ANSWER_CONFIDENCES as readonly string[]).includes(raw) ? (raw as AnswerConfidence) : null;
}
