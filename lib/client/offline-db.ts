import type { OfflinePackage } from "@/lib/server/offline/manifest";
import type { SyncEventType } from "@/lib/server/db/schema";

const DB_NAME = "certstudy-offline";
const DB_VERSION = 2;
const PACKAGES_STORE = "packages";
const SYNC_EVENTS_STORE = "pendingSyncEvents";

export interface StoredOfflinePackage {
  key: string;
  userId: string;
  certificationId: string;
  certSlug: string;
  certName: string;
  version: string;
  downloadedAt: string;
  sizeBytes: number;
  data: OfflinePackage;
}

export type PendingSyncEventStatus = "pending" | "syncing" | "failed" | "conflict" | "synced";

export interface PendingSyncEvent {
  clientEventId: string;
  userId: string;
  type: SyncEventType;
  createdAt: string;
  payload: unknown;
  /** Kurzer, menschenlesbarer Kontext für die UI (z. B. Kursname/Abschnitt),
   * damit die Warteschlange nicht nur IDs anzeigen muss. */
  label: string;
  status: PendingSyncEventStatus;
  attempts: number;
  lastError: string | null;
  syncedAt: string | null;
}

function packageKey(userId: string, certificationId: string): string {
  return `${userId}:${certificationId}`;
}

function isSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * R4.2/R4.3 (roadmap.md): rohes IndexedDB statt einer Bibliothek - das
 * frühere Dexie-System wurde bewusst als parallele v1-Datenquelle entfernt
 * (siehe "Konsolidierung vor R4" in roadmap.md), eine neue Abhängigkeit
 * dafür einzuführen wäre dem zuwidergelaufen. Zwei Object Stores: das
 * heruntergeladene Kurspaket (R4.1/4.2) und die Warteschlange offline
 * aufgezeichneter Ereignisse, die noch zum Server müssen (R4.3).
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isSupported()) {
      reject(new Error("IndexedDB wird in diesem Kontext nicht unterstützt."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKAGES_STORE)) {
        const store = db.createObjectStore(PACKAGES_STORE, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SYNC_EVENTS_STORE)) {
        const store = db.createObjectStore(SYNC_EVENTS_STORE, { keyPath: "clientEventId" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB konnte nicht geöffnet werden."));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB-Zugriff fehlgeschlagen."));
    });
  } finally {
    db.close();
  }
}

async function getAllByUserId<T>(storeName: string, userId: string): Promise<T[]> {
  const db = await openDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const index = tx.objectStore(storeName).index("userId");
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB-Zugriff fehlgeschlagen."));
    });
  } finally {
    db.close();
  }
}

/** Keine Passwort- oder Session-Secrets werden hier gespeichert - nur
 * öffentlich lesbarer Kursinhalt (Lessons/Fragen), siehe R4.2. */
export async function saveOfflinePackage(
  userId: string,
  pkg: OfflinePackage,
  sizeBytes: number,
): Promise<StoredOfflinePackage> {
  const record: StoredOfflinePackage = {
    key: packageKey(userId, pkg.certificationId),
    userId,
    certificationId: pkg.certificationId,
    certSlug: pkg.certSlug,
    certName: pkg.certName,
    version: pkg.version,
    downloadedAt: new Date().toISOString(),
    sizeBytes,
    data: pkg,
  };
  await withStore(PACKAGES_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function getOfflinePackageRecord(
  userId: string,
  certificationId: string,
): Promise<StoredOfflinePackage | undefined> {
  return withStore(PACKAGES_STORE, "readonly", (store) => store.get(packageKey(userId, certificationId)));
}

export async function deleteOfflinePackage(userId: string, certificationId: string): Promise<void> {
  await withStore(PACKAGES_STORE, "readwrite", (store) => store.delete(packageKey(userId, certificationId)));
}

export async function listOfflinePackages(userId: string): Promise<StoredOfflinePackage[]> {
  return getAllByUserId<StoredOfflinePackage>(PACKAGES_STORE, userId);
}

/** R4.2: "Bei Logout nutzerbezogene lokale Daten entfernen" - bewusst nur
 * das heruntergeladene KURSPAKET (jederzeit erneut herunterladbar), NICHT
 * die Sync-Warteschlange (lib/client/sync-queue.ts): die enthält bereits
 * erbrachte, noch nicht übertragene Lernleistung, die bei einem Logout
 * nicht verloren gehen darf - sie bleibt bis zum nächsten erfolgreichen
 * Sync auf dem Gerät liegen, unabhängig davon, wer gerade eingeloggt ist. */
export async function clearOfflineDataForUser(userId: string): Promise<void> {
  if (!isSupported()) return;
  const packages = await listOfflinePackages(userId).catch(() => []);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PACKAGES_STORE, "readwrite");
      const store = tx.objectStore(PACKAGES_STORE);
      for (const pkg of packages) store.delete(pkg.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB-Zugriff fehlgeschlagen."));
    });
  } finally {
    db.close();
  }
}

export async function savePendingSyncEvent(event: PendingSyncEvent): Promise<void> {
  await withStore(SYNC_EVENTS_STORE, "readwrite", (store) => store.put(event));
}

export async function listPendingSyncEvents(userId: string): Promise<PendingSyncEvent[]> {
  return getAllByUserId<PendingSyncEvent>(SYNC_EVENTS_STORE, userId);
}

export async function deletePendingSyncEvent(clientEventId: string): Promise<void> {
  await withStore(SYNC_EVENTS_STORE, "readwrite", (store) => store.delete(clientEventId));
}

export { isSupported as isOfflineStorageSupported };
