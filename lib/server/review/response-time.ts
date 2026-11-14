/**
 * Aufgabe 06b (Review 12.11.2026): Antwortzeit je Frage, vom Client gemessen (Aufgabe 06a, Zeit im Hintergrund schon abgezogen).
 *
 * Der Client liefert Rohwerte. Der Server nimmt nur plausible Werte in `review_log.response_time_ms` auf: unter 300 ms war es
 * kein Lesen (Doppelklick, automatisiert), über 10 Minuten war die Person nicht bei der Frage. Solche Werte werden `null`,
 * gezählt wird die Antwort trotzdem. Alles dazwischen bleibt roh (nur auf ganze Millisekunden gerundet); Ausreißer innerhalb
 * der Grenzen filtern die Verbraucher selbst (Tageslimit, `slow_answers`, Basiszeit je Frage).
 */
export const MIN_RESPONSE_TIME_MS = 300;
export const MAX_RESPONSE_TIME_MS = 10 * 60_000;

/** Plausible Antwortzeit in ganzen Millisekunden, sonst null. Nimmt beliebige Eingaben an (Sync-Ereignisse sind ungeprüft). */
export function plausibleResponseTimeMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ms = Math.round(value);
  return ms >= MIN_RESPONSE_TIME_MS && ms <= MAX_RESPONSE_TIME_MS ? ms : null;
}

/**
 * Rohwert für Zwischenstände (Pause): eine nicht negative, endliche Zahl in ganzen Millisekunden, sonst undefined. Die Grenzen
 * gelten erst beim Verbuchen, damit sich die Zeit einer pausierten Frage beim Fortsetzen weiter addiert.
 */
export function rawResponseTimeMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
