/**
 * Unterbrechungen einer Lernsitzung (Aufgabe 12, Faktor 4.3): wie oft und wie lange die Seite während der Sitzung im Hintergrund
 * war (Tab-Wechsel, App im Hintergrund, gesperrter Bildschirm). Gespeichert werden nur Zahl und Gesamtdauer je Sitzung, nicht wann
 * und nicht wohin gewechselt wurde.
 */

/** Kürzere Wechsel zählen nicht (versehentliches Antippen, kurzer Blick auf eine Benachrichtigung). */
export const MIN_INTERRUPTION_MS = 2000;
/** Obergrenzen gegen kaputte oder manipulierte Werte: mehr als 500 Wechsel oder mehr als 24 Stunden sind keine Messung. */
export const MAX_INTERRUPTIONS = 500;
export const MAX_INTERRUPTION_TOTAL_MS = 24 * 60 * 60 * 1000;

export interface Interruptions {
  count: number;
  totalMs: number;
}

/** Macht aus unbekannter Eingabe (API, Sync-Warteschlange, Zwischenstand) gültige Werte oder null. */
export function parseInterruptions(raw: unknown): Interruptions | null {
  if (!raw || typeof raw !== "object") return null;
  const { count, totalMs } = raw as { count?: unknown; totalMs?: unknown };
  if (typeof count !== "number" || typeof totalMs !== "number" || !Number.isInteger(count) || !Number.isFinite(totalMs)) return null;
  if (count < 0 || count > MAX_INTERRUPTIONS || totalMs < 0 || totalMs > MAX_INTERRUPTION_TOTAL_MS) return null;
  // Ohne Wechsel keine Dauer; mit Wechseln mindestens die Mindestdauer je Wechsel.
  if (count === 0) return totalMs === 0 ? { count: 0, totalMs: 0 } : null;
  if (totalMs < count * MIN_INTERRUPTION_MS) return null;
  return { count, totalMs: Math.round(totalMs) };
}
