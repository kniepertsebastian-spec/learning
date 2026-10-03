/**
 * Einfacher In-Memory-Rate-Limiter (Fixed Window) für Login, Registrierung und
 * KI-Routen. Reicht für die aktuelle Einzelinstanz-Bereitstellung
 * (docker-compose.yml, ein app-Container) - bei mehreren Instanzen bräuchte
 * es einen geteilten Speicher (z. B. Redis), da jeder Prozess sonst sein
 * eigenes Kontingent zählt.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Zählt einen Versuch für `key` und meldet, ob er innerhalb von `limit`
 * Versuchen pro `windowMs` liegt. `now` nur für Tests überschreiben.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}

/** Nur für Tests: setzt alle Zähler zurück. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/**
 * Client-IP hinter dem cloudflared-Tunnel bzw. Caddy. `cf-connecting-ip`
 * setzt Cloudflare selbst (nicht vom Client fälschbar, solange die App nur
 * über den Tunnel erreichbar ist - siehe Port-Bindung in docker-compose.yml).
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function sweepExpired(now: number) {
  // Höchstens einmal pro Minute aufräumen, damit abgelaufene Schlüssel den
  // Speicher nicht unbegrenzt füllen.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
