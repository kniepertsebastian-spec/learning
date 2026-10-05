/**
 * E-Mail-Versand über SMTP, anbieterneutral (zunächst Gmail, später ein EU-Anbieter: nur die
 * Umgebungsvariablen ändern sich). Ohne vollständige Konfiguration ist der Versand AUS
 * (isMailConfigured() = false): die Funktionen, die E-Mail brauchen, schalten dann ab bzw. um.
 *
 *   MAIL_SMTP_HOST      z. B. smtp.gmail.com
 *   MAIL_SMTP_PORT      465 (implizites TLS, Standard) oder 587 (STARTTLS, wird erzwungen)
 *   MAIL_SMTP_SECURE    optional "1"/"0": implizites TLS ein/aus. Ohne Angabe gilt es nur auf Port 465
 *                       (manche Anbieter nutzen implizites TLS auf anderen Ports)
 *   MAIL_SMTP_USER      bei Gmail die Adresse
 *   MAIL_SMTP_PASSWORD  bei Gmail ein App-Passwort
 *   MAIL_FROM           Absender, z. B. "Learning <name@gmail.com>"
 *   APP_BASE_URL        öffentliche Adresse der App für Links in E-Mails, in Produktion https
 *   MAIL_SMTP_INSECURE  "1" erlaubt unverschlüsseltes SMTP, NUR außerhalb von Produktion (Tests)
 */
export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  password: string;
  from: string;
  baseUrl: string;
};

export function getMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const host = env.MAIL_SMTP_HOST?.trim();
  const user = env.MAIL_SMTP_USER?.trim();
  const password = env.MAIL_SMTP_PASSWORD;
  const from = env.MAIL_FROM?.trim();
  const baseUrlRaw = env.APP_BASE_URL?.trim();
  if (!host || !user || !password || !from || !baseUrlRaw) return null;

  const port = Number(env.MAIL_SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlRaw);
  } catch {
    return null;
  }
  const production = env.NODE_ENV === "production";
  // Links mit Einmal-Tokens dürfen in Produktion nicht über unverschlüsseltes http laufen.
  if (!["http:", "https:"].includes(baseUrl.protocol)) return null;
  if (production && baseUrl.protocol !== "https:") return null;

  const insecure = env.MAIL_SMTP_INSECURE === "1" && !production;
  const secureSetting = env.MAIL_SMTP_SECURE?.trim();
  const secure = secureSetting === "1" ? true : secureSetting === "0" ? false : port === 465;
  return {
    host,
    port,
    secure,
    // Zugangsdaten gehen nie unverschlüsselt über die Leitung: bei 587 wird STARTTLS verlangt.
    requireTLS: !secure && !insecure,
    user,
    password,
    from,
    baseUrl: baseUrl.origin,
  };
}

export function isMailConfigured(): boolean {
  return getMailConfig() !== null;
}

/** Absolute Adresse für Links in E-Mails. Nur sinnvoll, wenn der Versand konfiguriert ist. */
export function appUrl(path: string, config: MailConfig | null = getMailConfig()): string {
  if (!config) throw new Error("E-Mail-Versand ist nicht konfiguriert");
  return `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
