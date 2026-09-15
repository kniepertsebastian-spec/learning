import type { OfflinePackage } from "@/lib/server/offline/manifest";

const DB_NAME = "certstudy-offline";
const DB_VERSION = 1;
const STORE_NAME = "packages";

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

function packageKey(userId: string, certificationId: string): string {
  return `${userId}:${certificationId}`;
}

function isSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * R4.2 (roadmap.md): rohes IndexedDB statt einer Bibliothek - das frühere
 * Dexie-System wurde bewusst als parallele v1-Datenquelle entfernt (siehe
 * "Konsolidierung vor R4" in roadmap.md), eine neue Abhängigkeit dafür
 * einzuführen wäre dem zuwidergelaufen. Ein Object Store genügt für den
 * schmalen Bedarf hier (ein Paket pro Nutzer+Kurs).
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB konnte nicht geöffnet werden."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = fn(store);
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
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function getOfflinePackageRecord(
  userId: string,
  certificationId: string,
): Promise<StoredOfflinePackage | undefined> {
  return withStore("readonly", (store) => store.get(packageKey(userId, certificationId)));
}

export async function deleteOfflinePackage(userId: string, certificationId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(packageKey(userId, certificationId)));
}

export async function listOfflinePackages(userId: string): Promise<StoredOfflinePackage[]> {
  const db = await openDb();
  try {
    return await new Promise<StoredOfflinePackage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("userId");
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB-Zugriff fehlgeschlagen."));
    });
  } finally {
    db.close();
  }
}

/** R4.2: "Bei Logout nutzerbezogene lokale Daten entfernen." */
export async function clearOfflineDataForUser(userId: string): Promise<void> {
  if (!isSupported()) return;
  const packages = await listOfflinePackages(userId).catch(() => []);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const pkg of packages) store.delete(pkg.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB-Zugriff fehlgeschlagen."));
    });
  } finally {
    db.close();
  }
}

export { isSupported as isOfflineStorageSupported };
