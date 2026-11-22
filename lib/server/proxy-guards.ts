/**
 * Auth.js v5 speichert die Sitzung in `authjs.session-token` (über https mit Präfix `__Secure-`). Wird das JWT größer als
 * ein Cookie fassen kann, teilt Auth.js es in `authjs.session-token.0`, `.1`, ... - dann gibt es den Cookie ohne Endung nicht.
 */
const SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/;

/** Ob ein (ggf. gestückelter) Sitzungs-Cookie mit Inhalt da ist. Nur die Vorprüfung im Proxy; gültig macht ihn erst auth(). */
export function hasSessionCookie(cookies: ReadonlyArray<{ name: string; value: string }>): boolean {
  return cookies.some((cookie) => SESSION_COOKIE.test(cookie.name) && cookie.value !== "");
}

/** localhost, 127.0.0.0/8 und [::1]: dort läuft der Produktionsbuild in CI/E2E über http. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Hostname aus dem Host-Header (ohne Port). `request.nextUrl.hostname` taugt dafür nicht: unter `next start` steht dort der
 * Hostname, an den der Server gebunden ist (localhost), nicht der angefragte - hinter dem Cloudflare-Tunnel also nie die Domain.
 */
export function hostnameFromHostHeader(host: string | null | undefined): string | null {
  const value = host?.trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 1 ? value.slice(0, end + 1) : null;
  }
  return value.split(":")[0] || null;
}
