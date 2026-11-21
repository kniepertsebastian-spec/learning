import type { OfflinePackage } from "@/lib/server/offline/manifest";
import { requestPersistentStorage } from "@/lib/client/storage-status";
import { isQuotaExceededError, saveOfflinePackage, type StoredOfflinePackage } from "@/lib/client/offline-db";
import { accessFromStatus, type PackageAccess } from "@/lib/client/revoked-packages";

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number | null;
}

/** `QUOTA_EXCEEDED`: zu wenig Speicher auf dem Gerät (vorab erkannt oder beim Schreiben); `DOWNLOAD_FAILED`: alles andere. */
export type OfflineDownloadErrorCode = "QUOTA_EXCEEDED" | "DOWNLOAD_FAILED";

/** Fehler mit festem Code: die Oberfläche zeigt dazu eine lokalisierte Meldung statt der rohen (englischen) Browser-Meldung. */
export class OfflineDownloadError extends Error {
  constructor(
    readonly code: OfflineDownloadErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OfflineDownloadError";
  }
}

/** Fester Puffer über der Paketgröße: IndexedDB braucht für Index, Metadaten und das alte Paket beim Ersetzen etwas mehr. */
export const STORAGE_RESERVE_BYTES = 1024 * 1024;
/** Zuschlag auf die Paketgröße (gespeichertes Objekt ist etwas größer als das JSON). */
export const STORAGE_SIZE_FACTOR = 1.2;

/** So viele Bytes sollten frei sein, damit ein Paket der Größe `packageBytes` sicher gespeichert werden kann. */
export function requiredStorageBytes(packageBytes: number): number {
  return Math.ceil(packageBytes * STORAGE_SIZE_FACTOR) + STORAGE_RESERVE_BYTES;
}

/**
 * Passt ein Paket der Größe `packageBytes` laut `navigator.storage.estimate()` noch in den Speicher? Ohne Schätzung
 * (alter Browser, Fehler, fehlende Werte) `true`: dann entscheidet der Schreibversuch selbst.
 */
export async function hasStorageRoomFor(packageBytes: number): Promise<boolean> {
  if (!Number.isFinite(packageBytes) || packageBytes <= 0) return true;
  try {
    if (typeof navigator === "undefined" || typeof navigator.storage?.estimate !== "function") return true;
    const { usage, quota } = await navigator.storage.estimate();
    if (typeof usage !== "number" || typeof quota !== "number" || quota <= 0) return true;
    return quota - usage >= requiredStorageBytes(packageBytes);
  } catch {
    return true;
  }
}

function quotaError(cause?: unknown): OfflineDownloadError {
  return new OfflineDownloadError("QUOTA_EXCEEDED", "Nicht genug Speicherplatz für das Kurspaket.", { cause });
}

/**
 * R4.1: lädt das versionierte Kurspaket und meldet den Fortschritt über
 * einen Streaming-Read (statt einem einzigen `res.json()`), damit
 * "Downloadfortschritt" tatsächlich etwas anzuzeigen hat. Das Paket wird
 * erst nach vollständigem, erfolgreichem Parsen gespeichert - eine
 * abgebrochene/fehlgeschlagene Aktualisierung überschreibt die bisherige,
 * noch funktionierende Version nicht ("Veraltete Kursversion erst nach
 * erfolgreichem Ersatz löschen").
 *
 * Speicherplatz wird zweimal geprüft: vor dem Download anhand von `Content-Length` (spart den Download, wenn es sicher
 * nicht passt) und vor dem Schreiben anhand der tatsächlichen Größe. Fehler kommen immer als `OfflineDownloadError`.
 */
export async function downloadOfflinePackage(
  certificationId: string,
  userId: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<StoredOfflinePackage> {
  try {
    const response = await fetch(`/api/cert/${certificationId}/offline-package`, {
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      throw new OfflineDownloadError("DOWNLOAD_FAILED", `Download fehlgeschlagen (${response.status}).`);
    }

    const totalBytesHeader = response.headers.get("Content-Length");
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    if (totalBytes !== null && !(await hasStorageRoomFor(totalBytes))) {
      await response.body.cancel().catch(() => {});
      throw quotaError();
    }

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

    // `Content-Length` ist bei komprimierter Übertragung kleiner als das Paket: hier mit der echten Größe prüfen.
    if (!(await hasStorageRoomFor(loadedBytes))) throw quotaError();

    const stored = await saveOfflinePackage(userId, pkg, loadedBytes);
    // Nach dem ersten erfolgreichen Download dauerhaften Speicher anfragen, damit der
    // Browser (v. a. iOS/Safari) die Offline-Daten nicht still räumt. Ergebnis ist optional.
    await requestPersistentStorage();
    return stored;
  } catch (error) {
    if (error instanceof OfflineDownloadError) throw error;
    if (isQuotaExceededError(error)) throw quotaError(error);
    throw new OfflineDownloadError("DOWNLOAD_FAILED", error instanceof Error ? error.message : "Download fehlgeschlagen.", { cause: error });
  }
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
