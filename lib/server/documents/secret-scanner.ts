/**
 * Scanner für Zugangsdaten in hochgeladenen Firmendokumenten (Phase 3: „Passwort- und Schlüssel-Scanner
 * beim Upload“). Reine Funktion ohne I/O. Ein Fund heißt: das Dokument wird NICHT gespeichert und nie an
 * eine KI weitergegeben.
 *
 * Wichtig: Ein Fund enthält nur Art, Seite und Zeile, NIE den gefundenen Wert. Damit kann ein Geheimnis
 * weder über die Fehlermeldung noch über das Audit-Log oder Logs weiterwandern.
 *
 * Grenzen (bewusst benannt): Es wird nur Text geprüft. Bilder, gescannte Seiten und Passwörter in
 * Prosa („das Passwort ist der Name des Hundes“) erkennt der Scanner nicht. Er ist ein Sicherheitsnetz
 * gegen versehentlich eingefügte Schlüssel, Token und Passwörter, keine Garantie.
 */

export type SecretKind =
  | "private_key"
  | "aws_access_key"
  | "aws_secret_key"
  | "github_token"
  | "google_api_key"
  | "slack_token"
  | "stripe_key"
  | "jwt"
  | "url_credentials"
  | "auth_header"
  | "password_assignment";

export type SecretFinding = { kind: SecretKind; pageNumber: number; line: number };

export const SECRET_KIND_LABELS: Record<SecretKind, { de: string; en: string }> = {
  private_key: { de: "privater Schlüssel", en: "private key" },
  aws_access_key: { de: "AWS-Zugangsschlüssel", en: "AWS access key" },
  aws_secret_key: { de: "AWS-Geheimschlüssel", en: "AWS secret key" },
  github_token: { de: "GitHub-Token", en: "GitHub token" },
  google_api_key: { de: "Google-API-Schlüssel", en: "Google API key" },
  slack_token: { de: "Slack-Token", en: "Slack token" },
  stripe_key: { de: "Stripe-Schlüssel", en: "Stripe key" },
  jwt: { de: "JWT-Token", en: "JWT token" },
  url_credentials: { de: "Benutzername und Passwort in einer Adresse", en: "username and password in a URL" },
  auth_header: { de: "Zugangsdaten in einem Authorization-Header", en: "credentials in an Authorization header" },
  password_assignment: { de: "Passwort oder Geheimnis (Zuweisung)", en: "password or secret (assignment)" },
};

// Eindeutige Formate: ein Treffer ist praktisch immer ein echtes Geheimnis.
const FORMAT_RULES: { kind: SecretKind; pattern: RegExp }[] = [
  { kind: "private_key", pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { kind: "aws_access_key", pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/ },
  { kind: "aws_secret_key", pattern: /aws[_\s-]?secret[_\s-]?access[_\s-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/i },
  { kind: "github_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { kind: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "slack_token", pattern: /\bxox[abeprs]-[0-9A-Za-z-]{10,}\b/ },
  { kind: "stripe_key", pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/ },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { kind: "auth_header", pattern: /\bAuthorization["']?\s*[:=]\s*["']?(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{16,}/i },
];

// Adresse mit Zugangsdaten: scheme://nutzer:passwort@host
const URL_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@<>"']+):([^\s@<>"']+)@[^\s/<>"']+/gi;

// „Passwort: …“, „password = …“, „api_key: …“. Der Wert darf nicht nach Platzhalter aussehen.
const PASSWORD_ASSIGNMENT =
  /(?<![A-Za-z])(?:password|passwort|passwd|pwd|kennwort|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*(?:[:=]|ist|is)\s*["'`]?([^\s"'`,;]{8,})/gi;

const PLACEHOLDER_WORDS =
  /^(?:xxx+|\*+|•+|\.{3,}|<.*>|\[.*\]|\{.*\}|\$\{.*\}|%.*%|your[_-].*|dein[_-].*|ihr[_-].*|example.*|beispiel.*|changeme|change[_-]me|geheim|secret|password|passwort|placeholder|platzhalter|null|none|redacted|geschw[aä]rzt|hidden|todo|tbd)$/i;

function classes(value: string): number {
  let n = 0;
  if (/[a-z]/.test(value)) n++;
  if (/[A-Z]/.test(value)) n++;
  if (/[0-9]/.test(value)) n++;
  if (/[^A-Za-z0-9]/.test(value)) n++;
  return n;
}

/**
 * Sieht der Wert nach einem echten Passwort aus? Mindestens 8 Zeichen (schon im Muster), keine
 * Platzhalter, und mindestens zwei Zeichenklassen mit Ziffer oder Sonderzeichen. So bleiben Sätze wie
 * „Passwort: mindestens zwölf Zeichen“ unbeanstandet, „Passwort: Sommer2024!“ nicht.
 */
function looksLikeRealPassword(value: string): boolean {
  if (PLACEHOLDER_WORDS.test(value)) return false;
  if (/^(.)\1+$/.test(value)) return false; // „aaaaaaaa“
  return classes(value) >= 2 && (/[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value));
}

function scanLine(line: string): SecretKind[] {
  const kinds: SecretKind[] = [];
  for (const { kind, pattern } of FORMAT_RULES) {
    if (pattern.test(line)) kinds.push(kind);
  }
  for (const m of line.matchAll(URL_CREDENTIALS)) {
    if (!PLACEHOLDER_WORDS.test(m[2]) && !/^\$\{|^<|^\{/.test(m[2])) {
      kinds.push("url_credentials");
      break;
    }
  }
  for (const m of line.matchAll(PASSWORD_ASSIGNMENT)) {
    if (looksLikeRealPassword(m[1])) {
      kinds.push("password_assignment");
      break;
    }
  }
  return kinds;
}

/** Prüft den Text seitenweise und liefert Funde (Art, Seite, Zeile), nie den Wert. */
export function scanForSecrets(pages: { pageNumber: number; text: string }[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const kind of scanLine(line)) {
        findings.push({ kind, pageNumber: page.pageNumber, line: index + 1 });
      }
    });
  }
  return findings;
}
