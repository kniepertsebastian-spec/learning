/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 4, optional je Firma): Pakete interner Lernpfade sind
 * gesperrt, wenn sie länger als die eingestellten Tage nicht online geprüft wurden oder die Geräteuhr manipuliert
 * (vor den letzten Prüf-/Download-Zeitpunkt zurückgestellt) wurde. Standard: aus.
 */

export interface PackageExpiryInput {
  offlineMaxAgeDays?: number | null;
  /** Letzte erfolgreiche Online-Prüfung des Zugriffs; fehlt bei älteren Paketen, dann gilt der Download. */
  lastVerifiedAt?: string | null;
  downloadedAt: string;
}

/** 5 Minuten Toleranz für normale NTP-Uhrzeitkorrekturen. */
export const CLOCK_DRIFT_TOLERANCE_MS = 5 * 60 * 1000;

export function isPackageLocked(input: PackageExpiryInput, now: Date): boolean {
  const days = input.offlineMaxAgeDays;
  if (!days || days <= 0) return false;
  const downloadedMs = new Date(input.downloadedAt).getTime();
  const verifiedMs = input.lastVerifiedAt ? new Date(input.lastVerifiedAt).getTime() : NaN;
  const since = Number.isFinite(verifiedMs) ? verifiedMs : downloadedMs;
  if (!Number.isFinite(since)) return false;

  const highWaterMark = Number.isFinite(verifiedMs) && Number.isFinite(downloadedMs)
    ? Math.max(downloadedMs, verifiedMs)
    : since;

  // Rückwärts gestellte Geräteuhr erkennen, damit die Ablauffrist nicht per Uhr-Reset umgangen werden kann.
  if (now.getTime() + CLOCK_DRIFT_TOLERANCE_MS < highWaterMark) {
    return true;
  }

  return now.getTime() - since > days * 86_400_000;
}
