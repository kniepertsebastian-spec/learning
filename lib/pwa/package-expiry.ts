/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 4, optional je Firma): Pakete interner Lernpfade sind
 * gesperrt, wenn sie länger als die eingestellten Tage nicht online geprüft wurden. Standard: aus.
 */

export interface PackageExpiryInput {
  offlineMaxAgeDays?: number | null;
  /** Letzte erfolgreiche Online-Prüfung des Zugriffs; fehlt bei älteren Paketen, dann gilt der Download. */
  lastVerifiedAt?: string | null;
  downloadedAt: string;
}

export function isPackageLocked(input: PackageExpiryInput, now: Date): boolean {
  const days = input.offlineMaxAgeDays;
  if (!days || days <= 0) return false;
  const since = new Date(input.lastVerifiedAt ?? input.downloadedAt).getTime();
  if (!Number.isFinite(since)) return false;
  return now.getTime() - since > days * 86_400_000;
}
