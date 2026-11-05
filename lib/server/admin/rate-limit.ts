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
 * DB/Redis (siehe R0.3): die App läuft als genau eine Instanz (so festgelegt,
 * siehe DOCKER_DEPLOYMENT.md "Exactly one app instance"); ein Multi-Instanz-Deployment
 * bräuchte stattdessen einen geteilten Store. Ein Bucket pro kostenpflichtiger Admin-Aktion (statt
 * eines geteilten globalen Limits), damit z. B. viele Content-Generierungen
 * nicht die Blueprint-Extraktion blockieren und umgekehrt.
 */
export function checkRateLimit(
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

const REMEDIATION_GENERATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const REMEDIATION_GENERATION_MAX_PER_WINDOW = 20;

/** Tageskontingent je Lernendem für neu erzeugte Remediation-Inhalte (KI-Aufrufe). */
export function checkRemediationGenerationRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "remediation-generation",
    userId,
    REMEDIATION_GENERATION_WINDOW_MS,
    REMEDIATION_GENERATION_MAX_PER_WINDOW,
  );
}

const REMEDIATION_REGENERATE_COOLDOWN_MS = 10 * 60 * 1000;

/** Abklingzeit: dieselbe Remediation je Lernendem höchstens alle 10 Minuten neu erzeugen. */
export function checkRemediationRegenerateCooldown(
  userId: string,
  objectiveId: string,
): RateLimitResult {
  return checkRateLimit(
    "remediation-regenerate",
    `${userId}:${objectiveId}`,
    REMEDIATION_REGENERATE_COOLDOWN_MS,
    1,
  );
}

const COURSE_GENERATION_WINDOW_MS = 60 * 60 * 1000;
const COURSE_GENERATION_MAX_PER_WINDOW = 5;

/** Rate Limit für das Anlegen von Kursgenerierungs-Aufträgen (mehrstufig, teuer). */
export function checkCourseGenerationRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    "course-generation",
    userId,
    COURSE_GENERATION_WINDOW_MS,
    COURSE_GENERATION_MAX_PER_WINDOW,
  );
}
