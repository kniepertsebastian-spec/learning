export interface StorageStatus {
  usageBytes: number | null;
  quotaBytes: number | null;
  /** true/false, wenn der Browser es beantworten kann, sonst null. */
  persisted: boolean | null;
}

/**
 * Bittet den Browser, den Speicher dauerhaft zu halten (kein Räumen unter
 * Speicherdruck). Feature-Detection: ohne API (oder bei Fehler) ist das Ergebnis
 * null bzw. false, nie ein Fehler.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    await navigator.storage.persist();
    return (await navigator.storage.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const status: StorageStatus = { usageBytes: null, quotaBytes: null, persisted: null };
  if (typeof navigator === "undefined" || !navigator.storage) return status;
  try {
    const estimate = await navigator.storage.estimate?.();
    status.usageBytes = estimate?.usage ?? null;
    status.quotaBytes = estimate?.quota ?? null;
  } catch {
    // nur Anzeige
  }
  try {
    status.persisted = (await navigator.storage.persisted?.()) ?? null;
  } catch {
    // nur Anzeige
  }
  return status;
}
