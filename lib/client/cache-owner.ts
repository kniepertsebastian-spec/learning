import { LEGACY_CACHE, PAGES_CACHE } from "@/lib/pwa/cache-policy";

const OWNER_KEY = "proofpath-cache-owner";

interface OwnerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Gecachte Seiten gehören genau einem Nutzer (roadmap_pwa Regel 3). Wer angemeldet ist und nicht der zuletzt gemerkte
 * Besitzer ist, bekommt einen leeren Seiten-Cache - auch wenn die vorige Sitzung ohne Logout ablief. Ist kein Besitzer
 * bekannt (erste Anmeldung nach diesem Update), wird vorsichtshalber ebenfalls geleert. Gibt zurück, ob geleert wurde.
 */
export async function reconcileCacheOwner(
  userId: string | null,
  storage: OwnerStorage,
  clearPages: () => Promise<void>,
): Promise<boolean> {
  if (!userId) return false; // nicht angemeldet: nichts zuordnen, Besitzer bleibt der letzte
  let owner: string | null = null;
  try {
    owner = storage.getItem(OWNER_KEY);
  } catch {
    // Speicher nicht lesbar: wie „unbekannt“ behandeln
  }
  if (owner === userId) return false;
  await clearPages().catch(() => {});
  try {
    storage.setItem(OWNER_KEY, userId);
  } catch {
    // ohne Speicher wird bei jedem Start geleert - sicher, nur weniger offline verfügbar
  }
  return true;
}

export async function clearPagesCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all([caches.delete(PAGES_CACHE), caches.delete(LEGACY_CACHE)]).catch(() => {});
}
