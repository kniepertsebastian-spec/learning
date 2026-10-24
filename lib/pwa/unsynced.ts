/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 2): wann und wie deutlich auf noch nicht übertragene
 * Ergebnisse hingewiesen wird. Safari löscht den Speicher einer nicht installierten Website nach etwa 7 Tagen ohne Nutzung.
 */

/** Ab diesem Alter des ältesten unübertragenen Ereignisses erscheint der deutliche Hinweis. */
export const UNSYNCED_WARNING_AFTER_MS = 24 * 3_600_000;

export interface UnsyncedWarning {
  count: number;
  oldestAgeMs: number;
}

export function oldestAgeMs(oldestUnsyncedAt: string | null, now: Date): number | null {
  if (!oldestUnsyncedAt) return null;
  const age = now.getTime() - new Date(oldestUnsyncedAt).getTime();
  return Number.isFinite(age) ? Math.max(0, age) : null;
}

/**
 * Hinweis nur, wenn Ergebnisse älter als die Schwelle ausstehen UND die App nicht installiert läuft
 * (iOS/Safari ohne Installation). Installiert oder woanders gibt es das Löschrisiko nicht in dieser Form.
 */
export function unsyncedWarning(input: { count: number; oldestUnsyncedAt: string | null; standalone: boolean; iosSafari: boolean; now: Date }): UnsyncedWarning | null {
  if (input.count <= 0 || input.standalone || !input.iosSafari) return null;
  const age = oldestAgeMs(input.oldestUnsyncedAt, input.now);
  if (age === null || age < UNSYNCED_WARNING_AFTER_MS) return null;
  return { count: input.count, oldestAgeMs: age };
}

/** „vor 3 Tagen“ / „3 days ago“ (ganze Einheiten, abgerundet; unter einer Stunde „gerade eben“). */
export function formatAge(ms: number, locale: "de" | "en"): string {
  const de = locale === "de";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return de ? `vor ${days} ${days === 1 ? "Tag" : "Tagen"}` : `${days} ${days === 1 ? "day" : "days"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return de ? `vor ${hours} ${hours === 1 ? "Stunde" : "Stunden"}` : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return de ? "gerade eben" : "just now";
}
