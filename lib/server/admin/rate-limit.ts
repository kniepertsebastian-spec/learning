const globalForRateLimit = globalThis as unknown as {
  contentGenerationStarts?: Map<string, number[]>;
};
const startsByUser =
  globalForRateLimit.contentGenerationStarts ?? new Map<string, number[]>();
globalForRateLimit.contentGenerationStarts = startsByUser;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_STARTS_PER_WINDOW = 5;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * R0.3: einfaches serverseitiges Rate Limit für den (kostenpflichtigen)
 * Generierungs-Start pro Admin. Bewusst in-process statt in der DB/Redis -
 * die App läuft laut docker-compose.yml als eine einzelne App-Instanz; ein
 * Multi-Instanz-Deployment bräuchte stattdessen einen geteilten Store.
 */
export function checkContentGenerationRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const recentStarts = (startsByUser.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );

  if (recentStarts.length >= MAX_STARTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((recentStarts[0] + WINDOW_MS - now) / 1000);
    startsByUser.set(userId, recentStarts);
    return { allowed: false, retryAfterSeconds };
  }

  recentStarts.push(now);
  startsByUser.set(userId, recentStarts);
  return { allowed: true };
}
