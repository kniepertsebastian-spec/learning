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
