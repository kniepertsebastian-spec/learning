/**
 * Content-Security-Policy für Seiten-Antworten. Skripte laufen nur mit der
 * pro Anfrage erzeugten Nonce (kein 'unsafe-inline'); `strict-dynamic` erlaubt
 * die von diesen Skripten nachgeladenen Chunks. 'unsafe-eval' nur im Dev-Server
 * (React Refresh). Styles behalten 'unsafe-inline', weil React/Tailwind
 * style-Attribute setzen, die sich nicht per Nonce freigeben lassen.
 * Die Nonce setzt proxy.ts; Next.js liest sie aus diesem Header und trägt sie
 * in seine eigenen Skripte ein (siehe node_modules/next/dist/docs, Guide
 * "Content Security Policy").
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
