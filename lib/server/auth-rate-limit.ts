import { checkRateLimit, type RateLimitResult } from "./admin/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_EMAIL = 10;
const LOGIN_MAX_PER_IP = 30;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_MAX_PER_WINDOW = 5;

/**
 * Client-IP hinter Cloudflare Tunnel bzw. Caddy. Fehlt jeder Header, fallen
 * alle Anfragen in einen gemeinsamen Bucket "unknown" - das limitiert dann
 * strenger, nicht lockerer.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Login-Versuche je Konto UND je IP: das Konto-Limit greift auch bei
 * wechselnden IPs, das IP-Limit beim Durchprobieren vieler Konten. Beide
 * Zähler laufen bei jedem Versuch. Nachteil des Konto-Limits: Fremde können ein
 * Konto durch Fehlversuche für 15 Minuten sperren (bewusster Kompromiss).
 */
export function checkLoginRateLimit(ip: string, email: string): RateLimitResult {
  const byEmail = checkRateLimit("login-email", email, LOGIN_WINDOW_MS, LOGIN_MAX_PER_EMAIL);
  const byIp = checkRateLimit("login-ip", ip, LOGIN_WINDOW_MS, LOGIN_MAX_PER_IP);
  if (!byEmail.allowed) return byEmail;
  return byIp;
}

/** Registrierungsversuche je IP. */
export function checkRegistrationRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(
    "registration",
    ip,
    REGISTRATION_WINDOW_MS,
    REGISTRATION_MAX_PER_WINDOW,
  );
}

const INVITATION_CREATE_WINDOW_MS = 60 * 60 * 1000;
const INVITATION_CREATE_MAX_PER_WINDOW = 20;
const INVITATION_ACCEPT_WINDOW_MS = 15 * 60 * 1000;
const INVITATION_ACCEPT_MAX_PER_WINDOW = 10;
const DOCUMENT_UPLOAD_WINDOW_MS = 60 * 60 * 1000;
const DOCUMENT_UPLOAD_MAX_PER_WINDOW = 30;
const COURSE_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const COURSE_REQUEST_MAX_PER_WINDOW = 10;
const ASSIGNMENT_WINDOW_MS = 60 * 60 * 1000;
const ASSIGNMENT_MAX_PER_WINDOW = 60;

/** Einladungen anlegen: je Firmen-Admin (verhindert Massenerzeugung von Links). */
export function checkInvitationCreateRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "invitation-create",
    userId,
    INVITATION_CREATE_WINDOW_MS,
    INVITATION_CREATE_MAX_PER_WINDOW,
  );
}

/** Firmendokumente hochladen: je Nutzer (jeder Upload wird gelesen und gescannt). */
export function checkDocumentUploadRateLimit(userId: string): RateLimitResult {
  return checkRateLimit("document-upload", userId, DOCUMENT_UPLOAD_WINDOW_MS, DOCUMENT_UPLOAD_MAX_PER_WINDOW);
}

/** Lernpfade anfragen: je Nutzer. */
export function checkCourseRequestRateLimit(userId: string): RateLimitResult {
  return checkRateLimit("course-request", userId, COURSE_REQUEST_WINDOW_MS, COURSE_REQUEST_MAX_PER_WINDOW);
}

/** Lernpfade zuweisen: je Nutzer (Firmen-Admin oder Mentor). */
export function checkAssignmentRateLimit(userId: string): RateLimitResult {
  return checkRateLimit("assignment-create", userId, ASSIGNMENT_WINDOW_MS, ASSIGNMENT_MAX_PER_WINDOW);
}

/** Einladungen annehmen: je Nutzer (bremst Token-Raten; Tokens haben 256 Bit, das ist nur ein zweiter Riegel). */
export function checkInvitationAcceptRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "invitation-accept",
    userId,
    INVITATION_ACCEPT_WINDOW_MS,
    INVITATION_ACCEPT_MAX_PER_WINDOW,
  );
}

const ACCOUNT_ACTION_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_ACTION_MAX_PER_WINDOW = 10;
const ACCOUNT_EXPORT_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_EXPORT_MAX_PER_WINDOW = 5;

/** Passwort ändern und Konto löschen (beides verlangt das aktuelle Passwort): je Nutzer, zählt auch Fehlversuche. */
export function checkAccountActionRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "account-action",
    userId,
    ACCOUNT_ACTION_WINDOW_MS,
    ACCOUNT_ACTION_MAX_PER_WINDOW,
  );
}

/** Datenexport: je Nutzer (die Abfrage ist teuer und liefert alle persönlichen Daten). */
export function checkAccountExportRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "account-export",
    userId,
    ACCOUNT_EXPORT_WINDOW_MS,
    ACCOUNT_EXPORT_MAX_PER_WINDOW,
  );
}

const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
const RECOVERY_MAX_PER_IP = 10;
const RECOVERY_MAX_PER_EMAIL = 3;
const RECOVERY_TOKEN_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_TOKEN_MAX_PER_IP = 20;

/**
 * „Passwort vergessen“ und „Bestätigung erneut senden“: je IP 10/h und je Adresse 3/h. Die
 * Adress-Grenze schützt ein Postfach vor Mail-Flut, die IP-Grenze den Versand (Gmail hat Tageslimits).
 */
export function checkRecoveryRequestRateLimit(ip: string, email: string): RateLimitResult {
  const byEmail = checkRateLimit("recovery-email", email, RECOVERY_WINDOW_MS, RECOVERY_MAX_PER_EMAIL);
  const byIp = checkRateLimit("recovery-ip", ip, RECOVERY_WINDOW_MS, RECOVERY_MAX_PER_IP);
  if (!byEmail.allowed) return byEmail;
  return byIp;
}

/** Einlösen von Reset- und Bestätigungslinks: je IP 20 pro 15 Minuten. */
export function checkRecoveryTokenRateLimit(ip: string): RateLimitResult {
  return checkRateLimit("recovery-token", ip, RECOVERY_TOKEN_WINDOW_MS, RECOVERY_TOKEN_MAX_PER_IP);
}
