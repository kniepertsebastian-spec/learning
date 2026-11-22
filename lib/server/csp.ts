/**
 * Content-Security-Policy für Seiten-Antworten. Skripte laufen nur mit der
 * pro Anfrage erzeugten Nonce (kein 'unsafe-inline'); `strict-dynamic` erlaubt
 * die von diesen Skripten nachgeladenen Chunks. 'unsafe-eval' nur im Dev-Server
 * (React Refresh). Styles behalten 'unsafe-inline', weil React/Tailwind
 * style-Attribute setzen, die sich nicht per Nonce freigeben lassen.
 * Die Nonce setzt proxy.ts; Next.js liest sie aus diesem Header und trägt sie
 * in seine eigenen Skripte ein (siehe node_modules/next/dist/docs, Guide
 * "Content Security Policy").
 * `upgrade-insecure-requests` (http-Unterressourcen über https laden) gilt nur, wenn die Seite selbst
 * über https ausgeliefert wird: Der Produktionsbuild läuft in CI/E2E auf http://localhost, dort würde
 * die Direktive jeden Chunk auf https umbiegen und die Seite brechen.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean, upgradeInsecureRequests = !isDev): string {
  const directives = [
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
  ];
  if (upgradeInsecureRequests && !isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
