import { checkRateLimit, type RateLimitResult } from "./admin/rate-limit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_WINDOW = 10;
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

/** Login-Versuche je (IP, E-Mail): bremst Passwort-Raten gegen ein Konto. */
export function checkLoginRateLimit(ip: string, email: string): RateLimitResult {
  return checkRateLimit("login", `${ip}:${email}`, LOGIN_WINDOW_MS, LOGIN_MAX_PER_WINDOW);
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
