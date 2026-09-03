const globalForRateLimit = globalThis as unknown as {
  adminActionRateLimits?: Map<string, number[]>;
};
const attemptsByBucketAndUser =
  globalForRateLimit.adminActionRateLimits ?? new Map<string, number[]>();
globalForRateLimit.adminActionRateLimits = attemptsByBucketAndUser;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Generisches In-Process-Rate-Limit je (Bucket, Nutzer) - bewusst nicht in
 * DB/Redis (siehe R0.3): die App läuft laut docker-compose.yml als eine
 * einzelne App-Instanz; ein Multi-Instanz-Deployment bräuchte stattdessen
 * einen geteilten Store. Ein Bucket pro kostenpflichtiger Admin-Aktion (statt
 * eines geteilten globalen Limits), damit z. B. viele Content-Generierungen
 * nicht die Blueprint-Extraktion blockieren und umgekehrt.
 */
function checkRateLimit(
  bucket: string,
  userId: string,
  windowMs: number,
  maxPerWindow: number,
): RateLimitResult {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recentAttempts = (attemptsByBucketAndUser.get(key) ?? []).filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (recentAttempts.length >= maxPerWindow) {
    const retryAfterSeconds = Math.ceil((recentAttempts[0] + windowMs - now) / 1000);
    attemptsByBucketAndUser.set(key, recentAttempts);
    return { allowed: false, retryAfterSeconds };
  }

  recentAttempts.push(now);
  attemptsByBucketAndUser.set(key, recentAttempts);
  return { allowed: true };
}

const CONTENT_GENERATION_WINDOW_MS = 60 * 60 * 1000;
const CONTENT_GENERATION_MAX_PER_WINDOW = 5;

/** R0.3: Rate Limit für den (mehrstufigen, teuren) Content-Generierungsstart. */
export function checkContentGenerationRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "content-generation",
    userId,
    CONTENT_GENERATION_WINDOW_MS,
    CONTENT_GENERATION_MAX_PER_WINDOW,
  );
}

const BLUEPRINT_EXTRACTION_WINDOW_MS = 60 * 60 * 1000;
const BLUEPRINT_EXTRACTION_MAX_PER_WINDOW = 10;

/** R1.2: Rate Limit für den Blueprint-Extraktionsstart (ein einzelner,
 * günstigerer KI-Aufruf, daher ein großzügigeres Limit als bei R0.3). */
export function checkBlueprintExtractionRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "blueprint-extraction",
    userId,
    BLUEPRINT_EXTRACTION_WINDOW_MS,
    BLUEPRINT_EXTRACTION_MAX_PER_WINDOW,
  );
}
