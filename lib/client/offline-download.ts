import type { OfflinePackage } from "@/lib/server/offline/manifest";
import { saveOfflinePackage, type StoredOfflinePackage } from "@/lib/client/offline-db";

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

  return saveOfflinePackage(userId, pkg, loadedBytes);
}

export async function fetchOfflinePackageVersion(certificationId: string): Promise<string | null> {
  const response = await fetch(`/api/cert/${certificationId}/offline-package/version`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { version: string };
  return data.version;
}
