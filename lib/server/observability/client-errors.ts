import { z } from "zod";
import { stripQuery } from "./request-errors";

/**
 * Fehler im Browser sichtbar machen. Die Fehlerseiten (app/error.tsx, app/global-error.tsx) melden, was sie auffangen, an
 * `POST /api/client-errors`; hier wird die Meldung bereinigt und als eine JSON-Zeile ins Log geschrieben
 * (`docker compose logs app | grep client_error`), im selben Format wie die Serverfehler aus request-errors.ts.
 *
 * Die Meldung kommt ungeprüft aus dem Browser (auch ohne Anmeldung, weil die globale Fehlerseite gerade dann erscheint,
 * wenn z. B. die Datenbank fehlt). Deshalb: feste Längen, Abfrageteile und Fragmente aus allen Adressen entfernt, keine
 * Nutzerkennung, keine Steuerzeichen. Die Meldungen zählen nicht zu den Serverfehlern in `/api/monitor`, weil jeder sie
 * auslösen kann.
 */

export const MAX_CLIENT_ERROR_BODY_BYTES = 8 * 1024;

export const clientErrorSchema = z.object({
  /** Welche Fehlerseite gemeldet hat. */
  boundary: z.enum(["global", "route"]),
  name: z.string().max(200).optional(),
  message: z.string().max(2000),
  digest: z.string().max(100).optional(),
  stack: z.string().max(4000).optional(),
  /** Seite, auf der der Fehler auftrat (location.pathname oder ganze Adresse). */
  path: z.string().max(2000),
  chunkError: z.boolean(),
  /** Die Seite lädt wegen des Chunk-Fehlers gleich automatisch neu. */
  reloading: z.boolean(),
});
export type ClientErrorReport = z.infer<typeof clientErrorSchema>;

// Steuerzeichen (außer Zeilenumbruch im Stack) würden die JSON-Zeile im Log nicht brechen, aber Terminals beim Lesen stören.
const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]/g;
// Abfrage und Fragment aus jeder Adresse im Text: dort stehen bei uns Einmal-Tokens (Einladung, Passwort-Reset, Abmeldung).
const URL_QUERY = /(\bhttps?:\/\/[^\s?#"'()]*|(?<![\w])\/[^\s?#"'()]*)[?#][^\s"'()]*/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
/** Seiten mit einem Einmal-Token im Pfad (app/<prefix>/[token]); der Token wird ersetzt. */
export const TOKEN_PATH_PREFIXES = ["confirm-company", "invite", "reset-password", "reviewer-invite", "verify-email"] as const;
const TOKEN_PATH = new RegExp(`/(${TOKEN_PATH_PREFIXES.join("|")})/[^/\\s?#"'()]+`, "g");

export function sanitizeClientText(text: string, maxLength: number): string {
  return text.replace(CONTROL_CHARS, " ").replace(URL_QUERY, "$1").replace(TOKEN_PATH, "/$1/[token]").replace(EMAIL, "[email]").slice(0, maxLength);
}

/** Nur der Pfad, ohne Ursprung, Abfrage und Fragment. */
export function sanitizeClientPath(path: string): string {
  let pathname = path;
  try {
    pathname = new URL(path, "http://localhost").pathname;
  } catch {
    pathname = stripQuery(path);
  }
  return sanitizeClientText(pathname, 300);
}

export interface ClientErrorLogEntry {
  level: "error";
  event: "client_error";
  time: string;
  boundary: ClientErrorReport["boundary"];
  path: string;
  name: string | null;
  message: string;
  digest: string | null;
  chunkError: boolean;
  reloading: boolean;
  userAgent: string | null;
  stack?: string;
}

export function buildClientErrorEntry(report: ClientErrorReport, userAgent: string | null, now = Date.now()): ClientErrorLogEntry {
  return {
    level: "error",
    event: "client_error",
    time: new Date(now).toISOString(),
    boundary: report.boundary,
    path: sanitizeClientPath(report.path),
    name: report.name ? sanitizeClientText(report.name, 100) : null,
    message: sanitizeClientText(report.message, 500),
    digest: report.digest ? sanitizeClientText(report.digest, 100) : null,
    chunkError: report.chunkError,
    reloading: report.reloading,
    userAgent: userAgent ? sanitizeClientText(userAgent, 200) : null,
    stack: report.stack ? sanitizeClientText(report.stack.split("\n").slice(0, 8).join("\n"), 1500) : undefined,
  };
}

/** Schreibt die bereinigte Meldung als eine JSON-Zeile ins Log. Wirft nie. */
export function recordClientError(report: ClientErrorReport, userAgent: string | null, now = Date.now()): ClientErrorLogEntry {
  const entry = buildClientErrorEntry(report, userAgent, now);
  try {
    console.error(JSON.stringify(entry));
  } catch {
    // Loggen darf nie selbst einen Fehler auslösen.
  }
  return entry;
}
