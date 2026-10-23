/** Name des Background-Sync-Auftrags; der Rest ist die Nutzer-ID, damit der Service Worker nur die Ereignisse dieser Person überträgt. */
export const SYNC_TAG_PREFIX = "sync-queue:";

export function userIdFromSyncTag(tag: string): string | null {
  return tag.startsWith(SYNC_TAG_PREFIX) && tag.length > SYNC_TAG_PREFIX.length ? tag.slice(SYNC_TAG_PREFIX.length) : null;
}
