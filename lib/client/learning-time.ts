/**
 * Aktive Lernzeit messen (für die anonyme Abschluss-Statistik, roadmap3.md): gezählt wird nur, solange der Tab sichtbar
 * ist und die Person in den letzten zwei Minuten etwas getan hat (Tippen, Klicken, Scrollen, Bewegen). Die Zeit wird
 * gesammelt und etwa einmal pro Minute sowie beim Verlassen der Seite an den Server geschickt.
 * Ist das Gerät offline, bleiben die gesammelten Sekunden erhalten, bis wieder eine Verbindung besteht.
 */
export const TICK_SECONDS = 5;
export const IDLE_AFTER_MS = 120_000;
export const FLUSH_AT_SECONDS = 60;
export const MAX_BATCH_SECONDS = 120;

export type TimerState = { pending: number; lastInput: number };

/** Ein Takt: zählt TICK_SECONDS dazu, wenn sichtbar und nicht untätig. */
export function tick(state: TimerState, now: number, visible: boolean): TimerState {
  if (!visible || now - state.lastInput > IDLE_AFTER_MS) return state;
  return { ...state, pending: state.pending + TICK_SECONDS };
}

export function sendLearningTime(certificationId: string, seconds: number): boolean {
  if (seconds <= 0) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const body = JSON.stringify({ certificationId, seconds: Math.min(seconds, MAX_BATCH_SECONDS) });
  try {
    if (navigator.sendBeacon?.("/api/learning-time", new Blob([body], { type: "application/json" }))) return true;
  } catch {
    // weiter mit fetch
  }
  void fetch("/api/learning-time", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  return true;
}
