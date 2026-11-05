/**
 * Web Push: Einrichtung über Umgebungsvariablen. Ohne VAPID-Schlüssel gibt es kein Push: die Einstellungen sagen das offen, die
 * Schnittstellen antworten 503 und der Lauf der Erinnerungen tut nichts. Leere Werte (docker-compose reicht sie leer durch) zählen als nicht gesetzt.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** „mailto:…“ oder eine https-Adresse; der Push-Dienst kann den Betreiber damit erreichen. */
  subject: string;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = clean(process.env.VAPID_PUBLIC_KEY);
  const privateKey = clean(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: clean(process.env.VAPID_SUBJECT) ?? `mailto:${clean(process.env.SMTP_FROM)?.replace(/^.*<|>.*$/g, "") ?? "admin@example.com"}` };
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/** Hosts, an die der Server Push-Nachrichten schicken darf: die Dienste der großen Browser. Mehr nur über PUSH_ALLOWED_HOSTS (kommagetrennt). */
const BUILT_IN_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "web.push.apple.com", "push.apple.com", "notify.windows.com"];

export function allowedPushHosts(): string[] {
  const extra = (clean(process.env.PUSH_ALLOWED_HOSTS) ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...BUILT_IN_HOSTS, ...extra];
}
