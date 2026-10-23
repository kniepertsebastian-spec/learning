import type { SyncEventType } from "@/lib/server/db/schema";
import { SYNC_TAG_PREFIX } from "@/lib/pwa/sync-tag";
import { summarize, transferPendingEvents, type SyncQueueSummary } from "@/lib/client/sync-core";
import {
  deletePendingSyncEvent,
  listPendingSyncEvents,
  savePendingSyncEvent,
  type PendingSyncEvent,
} from "@/lib/client/offline-db";

function lastSyncedKey(userId: string): string {
  return `certstudy-last-synced-at:${userId}`;
}

const QUEUE_CHANGED_EVENT = "certstudy:sync-queue-changed";

/** SectionQuiz/StudySession reihen Ereignisse ein, ohne etwas von
 * SyncStatusBadge (Header, global montiert) zu wissen - ein DOM-Event ist
 * die einfachste Möglichkeit, den Badge trotzdem sofort zu aktualisieren,
 * statt nur bei Mount/online/manuellem Sync (sonst zeigt er nach einer
 * gerade offline abgeschlossenen Quiz/Session fälschlich "nichts
 * ausstehend" an, bis das nächste online-Event feuert). */
function notifyQueueChanged(): void {
  try {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch {
    // Kein window (SSR) - nichts zu benachrichtigen.
  }
}

export function onSyncQueueChanged(listener: () => void): () => void {
  window.addEventListener(QUEUE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, listener);
}

/** Rein informativer Anzeigewert (R4.4: "zuletzt synchronisierten
 * Zeitpunkt anzeigen") - bewusst in localStorage statt IndexedDB, da ein
 * Verlust hier höchstens die Anzeige zurücksetzt, nie echte Lernleistung
 * kostet (die liegt in der Sync-Warteschlange selbst). */
export function getLastSyncedAt(userId: string): string | null {
  try {
    return window.localStorage.getItem(lastSyncedKey(userId));
  } catch {
    return null;
  }
}

function setLastSyncedAt(userId: string, iso: string): void {
  try {
    window.localStorage.setItem(lastSyncedKey(userId), iso);
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus) - nur die Anzeige betroffen.
  }
}

export async function enqueueSyncEvent(
  userId: string,
  type: SyncEventType,
  payload: unknown,
  label: string,
): Promise<void> {
  const event: PendingSyncEvent = {
    clientEventId: crypto.randomUUID(),
    userId,
    type,
    createdAt: new Date().toISOString(),
    payload,
    label,
    status: "pending",
    attempts: 0,
    lastError: null,
    syncedAt: null,
  };
  await savePendingSyncEvent(event);
  notifyQueueChanged();
  registerBackgroundSync(userId);
}

export type { SyncQueueSummary };

export async function getSyncQueueSummary(userId: string): Promise<SyncQueueSummary> {
  return summarize(await listPendingSyncEvents(userId), getLastSyncedAt(userId));
}

/** Ein dauerhafter Konflikt (z. B. Session anderswo bereits abgeschlossen)
 * wird nicht automatisch erneut versucht - der Nutzer kann ihn explizit
 * verwerfen, sobald er den Hinweis gesehen hat. */
export async function discardPendingSyncEvent(clientEventId: string): Promise<void> {
  await deletePendingSyncEvent(clientEventId);
  notifyQueueChanged();
}

const inFlightSyncs = new Map<string, Promise<SyncQueueSummary>>();

/**
 * R4.3 (roadmap.md): "Automatisch bei online, App-Start und manuellem Sync
 * übertragen" - diese Funktion ist der gemeinsame Auslösepunkt für alle drei
 * Fälle (siehe components/SyncStatusBadge.tsx), die durchaus knapp
 * hintereinander (z. B. das `online`-Event und ein manueller Klick) für
 * denselben Nutzer ausgelöst werden können. Der Server macht Doppel-
 * Verarbeitung zwar bereits unmöglich (siehe processSingleEvent() in
 * lib/server/sync/service.ts), aber ohne diese Guard würden zwei
 * überlappende Aufrufe hier trotzdem dieselben "pending"-Einträge doppelt
 * an den Server schicken - unnötige Arbeit, die der eine Aufruf nur als
 * "wird bereits verarbeitet"-Fehler zurückbekäme. Verarbeitet nur
 * `pending`/`failed` Einträge - `conflict` wird bewusst nicht automatisch
 * erneut versucht (siehe discardPendingSyncEvent oben).
 */
export function runSync(userId: string): Promise<SyncQueueSummary> {
  const existing = inFlightSyncs.get(userId);
  if (existing) return existing;
  const promise = runSyncNow(userId).finally(() => inFlightSyncs.delete(userId));
  inFlightSyncs.set(userId, promise);
  return promise;
}

async function runSyncNow(userId: string): Promise<SyncQueueSummary> {
  const { summary } = await transferPendingEvents(
    userId,
    {
      list: listPendingSyncEvents,
      save: savePendingSyncEvent,
      remove: deletePendingSyncEvent,
      post: (body) => fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      onTransferred: (id, at) => setLastSyncedAt(id, at),
    },
    () => getLastSyncedAt(userId),
  );
  notifyQueueChanged();
  return summary;
}

/** Meldet die Warteschlange beim Service Worker an (Background Sync, Chrome/Android): er überträgt sie, sobald wieder Netz da ist, auch bei geschlossener App. Wo es das nicht gibt (iOS, Firefox), bleibt es bei `online`, App-Start und manuellem Sync. */
export function registerBackgroundSync(userId: string): void {
  try {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then((registration) => (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register(`${SYNC_TAG_PREFIX}${userId}`))
      .catch(() => {});
  } catch {
    // Kein Service Worker oder gesperrt: der Rückfall übernimmt.
  }
}

/** Nachricht des Service Workers nach einer Hintergrund-Übertragung: Anzeige aktualisieren. */
export function listenForBackgroundSync(): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; userId?: string; at?: string } | undefined;
    if (data?.type !== "SYNC_TRANSFERRED" || !data.userId || !data.at) return;
    setLastSyncedAt(data.userId, data.at);
    notifyQueueChanged();
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
