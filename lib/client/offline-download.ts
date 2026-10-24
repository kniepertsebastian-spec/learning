import type { OfflinePackage } from "@/lib/server/offline/manifest";
import { requestPersistentStorage } from "@/lib/client/storage-status";
import { saveOfflinePackage, type StoredOfflinePackage } from "@/lib/client/offline-db";
import { accessFromStatus, type PackageAccess } from "@/lib/client/revoked-packages";

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number | null;
}

/**
 * R4.1: lädt das versionierte Kurspaket und meldet den Fortschritt über
 * einen Streaming-Read (statt einem einzigen `res.json()`), damit
 * "Downloadfortschritt" tatsächlich etwas anzuzeigen hat. Das Paket wird
 * erst nach vollständigem, erfolgreichem Parsen gespeichert - eine
 * abgebrochene/fehlgeschlagene Aktualisierung überschreibt die bisherige,
 * noch funktionierende Version nicht ("Veraltete Kursversion erst nach
 * erfolgreichem Ersatz löschen").
 */
export async function downloadOfflinePackage(
  certificationId: string,
  userId: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<StoredOfflinePackage> {
  const response = await fetch(`/api/cert/${certificationId}/offline-package`, {
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download fehlgeschlagen (${response.status}).`);
  }

  const totalBytesHeader = response.headers.get("Content-Length");
  const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.({ loadedBytes, totalBytes });
  }

  const combined = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const json = new TextDecoder().decode(combined);
  const pkg = JSON.parse(json) as OfflinePackage;

  const stored = await saveOfflinePackage(userId, pkg, loadedBytes);
  // Nach dem ersten erfolgreichen Download dauerhaften Speicher anfragen, damit der
  // Browser (v. a. iOS/Safari) die Offline-Daten nicht still räumt. Ergebnis ist optional.
  await requestPersistentStorage();
  return stored;
}

export async function fetchOfflinePackageVersion(certificationId: string): Promise<string | null> {
  const response = await fetch(`/api/cert/${certificationId}/offline-package/version`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { version: string };
  return data.version;
}

/** Darf diese Person das Paket noch haben? 404/403 = Zugriff entzogen; Netzfehler, 401 und Serverfehler = unbekannt. */
export async function checkOfflinePackageAccess(certificationId: string): Promise<PackageAccess> {
  try {
    const response = await fetch(`/api/cert/${certificationId}/offline-package/version`, { cache: "no-store" });
    return accessFromStatus(response.status);
  } catch {
    return "unknown";
  }
}
