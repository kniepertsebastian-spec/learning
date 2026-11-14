import { MAX_BATCH_SECONDS } from "@/lib/client/learning-time";

/**
 * Lesezeit je Lektion (Aufgabe 16, Faktor 4.9): dieselbe Zählweise wie die Lernzeit (`learning-time.ts`: nur sichtbar, nur nach
 * Eingaben in den letzten zwei Minuten), aber mit der Lektion als Bezug. Gemeldet wird in Stücken von höchstens 120 Sekunden.
 * Offline entstandene Zeit geht nicht verloren, solange die Seite offen ist; wer die Lektion offline schließt, verliert sie.
 */
export function sendLessonTime(sectionId: string, seconds: number, opened = false): boolean {
  if (seconds <= 0 && !opened) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const body = JSON.stringify({ sectionId, seconds: Math.max(0, Math.min(seconds, MAX_BATCH_SECONDS)), ...(opened ? { opened: true } : {}) });
  try {
    if (navigator.sendBeacon?.("/api/lesson-time", new Blob([body], { type: "application/json" }))) return true;
  } catch {
    // weiter mit fetch
  }
  void fetch("/api/lesson-time", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  return true;
}
