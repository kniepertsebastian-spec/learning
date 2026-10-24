/**
 * Datenintegrität über Zeit (roadmap_datenintegritaet.md, Phase 4): Wer keinen Zugriff mehr hat, hat auch lokal keine
 * Inhalte mehr, sobald das Gerät online ist. Ohne Browser-Zugriff (Abhängigkeiten werden übergeben) und damit testbar.
 */

/** `unknown`: kein Netz, nicht angemeldet oder Serverfehler - dann wird nie gelöscht. */
export type PackageAccess = "granted" | "revoked" | "unknown";

export interface PackageRef {
  certificationId: string;
  certName: string;
}

export interface PruneDeps {
  list(): Promise<PackageRef[]>;
  check(certificationId: string): Promise<PackageAccess>;
  remove(certificationId: string): Promise<void>;
  /** Zugriff online bestätigt (setzt den Ablauf interner Lernpfade zurück). */
  verified?(certificationId: string): Promise<void>;
}

/** Entfernt lokale Pakete, auf die der Server den Zugriff verweigert (404/403). Die Sync-Warteschlange bleibt unberührt. */
export async function pruneRevokedPackages(deps: PruneDeps): Promise<PackageRef[]> {
  const removed: PackageRef[] = [];
  for (const pkg of await deps.list()) {
    const access = await deps.check(pkg.certificationId);
    if (access === "revoked") {
      await deps.remove(pkg.certificationId);
      removed.push(pkg);
    } else if (access === "granted") {
      await deps.verified?.(pkg.certificationId);
    }
  }
  return removed;
}

export function accessFromStatus(status: number): PackageAccess {
  if (status >= 200 && status < 300) return "granted";
  if (status === 404 || status === 403) return "revoked";
  return "unknown";
}
