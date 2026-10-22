import { clearPagesCache } from "@/lib/client/cache-owner";
import { clearOfflineDataForUser } from "@/lib/client/offline-db";

/**
 * Räumt nutzerbezogene Daten im Browser auf: Offline-Daten in IndexedDB (R4.2) und den
 * Seiten-Cache des Service Workers (angemeldet gerenderte Seiten). Best-effort: ein Fehler
 * darf Abmelden, Passwortwechsel oder Kontolöschung nicht verhindern.
 */
export async function clearLocalUserData(userId: string): Promise<void> {
  await clearOfflineDataForUser(userId).catch(() => {});
  await clearPagesCache();
}
