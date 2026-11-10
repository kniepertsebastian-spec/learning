interface RateLimitEntry {
  /** Zeitpunkte der gezählten Versuche, aufsteigend. */
  timestamps: number[];
  windowMs: number;
}

interface RateLimitStore {
  entries: Map<string, RateLimitEntry>;
  lastSweepAt: number;
}

// Eigener Name statt des früheren `adminActionRateLimits` (Map<string, number[]>): im Dev-Modus überlebt das globale Objekt ein
// Neuladen des Moduls, und ein Speicher mit anderem Aufbau würde dort hängen bleiben.
const globalForRateLimit = globalThis as unknown as { rateLimitStore?: RateLimitStore };
const store: RateLimitStore = globalForRateLimit.rateLimitStore ?? { entries: new Map(), lastSweepAt: 0 };
globalForRateLimit.rateLimitStore = store;

/** Abgelaufene Einträge werden höchstens so oft eingesammelt (beim nächsten Aufruf, ohne Timer). */
const SWEEP_INTERVAL_MS = 60 * 1000;
/**
 * Obergrenze für gleichzeitig verfolgte Schlüssel. Bei jedem Versuch mit einem neuen Schlüssel würde der Speicher sonst wachsen -
 * ein Angreifer ohne Konto kann beliebig viele erzeugen. Ist die Grenze erreicht, fliegt der am längsten unberührte Schlüssel raus;
 * das lockert dessen Zähler, hält aber den Speicher fest (rund 20.000 Einträge sind wenige MB).
 */
export const MAX_TRACKED_KEYS = 20_000;
/** Längere Schlüssel (z. B. ein ungeprüfter `X-Forwarded-For`) werden gekürzt, damit ein einzelner Eintrag nicht beliebig groß wird. */
export const MAX_KEY_LENGTH = 256;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Löscht alle Einträge, deren letzter Versuch außerhalb des Fensters liegt. */
function sweepExpired(now: number) {
  store.lastSweepAt = now;
  for (const [key, entry] of store.entries) {
    const last = entry.timestamps[entry.timestamps.length - 1];
    if (last === undefined || now - last >= entry.windowMs) store.entries.delete(key);
  }
}

/** Anzahl der aktuell verfolgten Schlüssel (für Tests und Diagnose). */
export function trackedRateLimitKeys(): number {
  return store.entries.size;
}

/**
 * Generisches In-Process-Rate-Limit je (Bucket, Nutzer) - bewusst nicht in
 * DB/Redis (siehe R0.3): die App läuft als genau eine Instanz (so festgelegt,
 * siehe DOCKER_DEPLOYMENT.md "Exactly one app instance"); ein Multi-Instanz-Deployment
 * bräuchte stattdessen einen geteilten Store. Ein Bucket pro kostenpflichtiger Admin-Aktion (statt
 * eines geteilten globalen Limits), damit z. B. viele Content-Generierungen
 * nicht die Blueprint-Extraktion blockieren und umgekehrt.
 *
 * Der Speicher bleibt begrenzt: abgelaufene Einträge werden regelmäßig gelöscht, und es werden höchstens
 * `MAX_TRACKED_KEYS` Schlüssel gleichzeitig verfolgt.
 */
export function checkRateLimit(
  bucket: string,
  userId: string,
  windowMs: number,
  maxPerWindow: number,
): RateLimitResult {
  const key = `${bucket}:${userId}`.slice(0, MAX_KEY_LENGTH);
  const now = Date.now();
  if (now - store.lastSweepAt >= SWEEP_INTERVAL_MS) sweepExpired(now);

  const existing = store.entries.get(key);
  const recentAttempts = (existing?.timestamps ?? []).filter((timestamp) => now - timestamp < windowMs);
  const blocked = recentAttempts.length >= maxPerWindow;
  if (!blocked) recentAttempts.push(now);

  // Neu einsortieren (löschen + setzen): die Reihenfolge der Map ist damit „zuletzt benutzt“, und `keys().next()` ist der älteste.
  store.entries.delete(key);
  if (store.entries.size >= MAX_TRACKED_KEYS) {
    const oldest = store.entries.keys().next();
    if (!oldest.done) store.entries.delete(oldest.value);
  }
  store.entries.set(key, { timestamps: recentAttempts, windowMs });

  if (blocked) {
    return { allowed: false, retryAfterSeconds: Math.ceil((recentAttempts[0] + windowMs - now) / 1000) };
  }
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
