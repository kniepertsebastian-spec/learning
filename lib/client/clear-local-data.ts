import { clearPagesCache } from "@/lib/client/cache-owner";
import { clearLastUserId } from "@/lib/client/last-user";
import { clearOfflineDataForUser, clearPendingSyncEventsForUser } from "@/lib/client/offline-db";
import { clearSyncMetadata } from "@/lib/client/sync-queue";

export type ClearLocalUserDataOptions = {
  /** Auch noch nicht übertragene Lernereignisse und die Sync-Merker verwerfen. Nur bei Kontolöschung:
   * beim Abmelden oder Passwortwechsel bleibt erbrachte Lernleistung bis zum nächsten Sync auf dem Gerät. */
  includeSyncQueue?: boolean;
};

/**
 * Räumt nutzerbezogene Daten im Browser auf: Offline-Daten in IndexedDB (R4.2) und den
 * Seiten-Cache des Service Workers (angemeldet gerenderte Seiten). Best-effort: ein Fehler
 * darf Abmelden, Passwortwechsel oder Kontolöschung nicht verhindern.
 */
export async function clearLocalUserData(userId: string, options: ClearLocalUserDataOptions = {}): Promise<void> {
  await clearOfflineDataForUser(userId).catch(() => {});
  if (options.includeSyncQueue) {
    await clearPendingSyncEventsForUser(userId).catch(() => {});
    clearSyncMetadata(userId);
  }
  await clearPagesCache();
  clearLastUserId();
}
