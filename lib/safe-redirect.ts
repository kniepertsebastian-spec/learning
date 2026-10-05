/**
 * Erlaubt als Weiterleitungsziel nur Pfade der eigenen Seite (z. B. "/invite/abc").
 * Alles andere (absolute URLs, "//host", Backslashes, Steuerzeichen) fällt auf
 * `fallback` zurück - Schutz vor offener Weiterleitung nach dem Login.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
