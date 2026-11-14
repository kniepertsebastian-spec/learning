/**
 * Anmeldezeitpunkt der Sitzung (Aufgabe 09). Den Wert setzt der jwt-Callback in lib/server/auth.ts beim Anmelden, der
 * session-Callback reicht ihn als `authenticatedAt` (Sekunden) weiter. Null bei Tokens aus der Zeit davor oder ohne Sitzung.
 */
export function sessionAuthenticatedAt(session: unknown): Date | null {
  const at = (session as { authenticatedAt?: unknown } | null)?.authenticatedAt;
  return typeof at === "number" && Number.isFinite(at) ? new Date(at * 1000) : null;
}
