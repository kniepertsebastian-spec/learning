import type { SyncEventType } from "@/lib/server/db/schema";
import { SYNC_TAG_PREFIX } from "@/lib/pwa/sync-tag";
import { chunkForKeepalive, summarize, transferPendingEvents, type SyncApiResult, type SyncQueueSummary } from "@/lib/client/sync-core";
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

/** Endgültig abgelehnte Ergebnisse (Server ordnet sie nicht zu), zum Ansehen und Verwerfen. */
export async function listRejectedSyncEvents(userId: string): Promise<PendingSyncEvent[]> {
  return (await listPendingSyncEvents(userId)).filter((e) => e.status === "rejected");
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

/**
 * Früher endete eine Session, die anderswo schon abgeschlossen war, als „Konflikt“ und wurde nie verbucht. Der Server zählt
 * ihre Antworten jetzt als Wiederholungen: alte Konflikte werden deshalb einmalig je Gerät und Person erneut eingereiht.
 */
async function requeueLegacyConflicts(userId: string): Promise<void> {
  const key = `certstudy-conflicts-requeued:${userId}`;
  try {
    if (window.localStorage.getItem(key)) return;
  } catch {
    return;
  }
  const conflicts = (await listPendingSyncEvents(userId)).filter((e) => e.status === "conflict");
  for (const event of conflicts) await savePendingSyncEvent({ ...event, status: "pending", attempts: 0, lastError: null });
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // ohne Speicher wird es bei jedem Sync erneut versucht - harmlos, der Server ist idempotent
  }
}

async function runSyncNow(userId: string): Promise<SyncQueueSummary> {
  await requeueLegacyConflicts(userId).catch(() => {});
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

/**
 * Beim Verlassen der Seite (Hintergrund, Schließen) die Warteschlange übertragen, solange das Gerät online ist: dort, wo
 * Background Sync fehlt (iOS), ist das die letzte Gelegenheit, bevor der Browser den Speicher räumen kann. `keepalive`
 * lässt die Anfrage das Schließen der Seite überleben (max. 64 KB je Anfrage, daher in Teilen). Die Verbuchung ist
 * idempotent: kommt die Antwort nicht mehr an, meldet der nächste normale Sync nur „schon verbucht“ und räumt auf.
 */
export async function flushQueueOnHide(userId: string): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    const events = (await listPendingSyncEvents(userId)).filter((e) => e.status === "pending" || e.status === "failed");
    if (events.length === 0) return;
    const { chunks } = chunkForKeepalive(events, userId);
    for (const chunk of chunks) {
      // Bewusst ohne Warten auf die Antwort: die Seite kann dabei schon weg sein.
      void fetch("/api/sync", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, events: chunk }) })
        .then(async (response) => {
          if (!response.ok) return;
          const results = ((await response.json()) as { results: SyncApiResult[] }).results;
          for (const r of results) {
            if (r.status === "applied" || r.status === "already_applied") await deletePendingSyncEvent(r.clientEventId);
          }
          setLastSyncedAt(userId, new Date().toISOString());
          notifyQueueChanged();
        })
        .catch(() => {});
    }
  } catch {
    // Beim Verlassen der Seite darf nichts werfen; der normale Sync beim nächsten Start übernimmt.
  }
}

/**
 * Gemeinsame Auslöser der Übertragung, unabhängig von der Seite (auch `/offline` ohne Header): beim Start, bei `online`
 * und beim Zurückkehren in den Vordergrund wird übertragen, beim Wechsel in den Hintergrund oder Schließen mit `keepalive`.
 * `resolveUserId` liefert die Person, der die Warteschlange gehört (angemeldet oder zuletzt angemeldet, siehe last-user.ts).
 */
export function startSyncTriggers(resolveUserId: () => string | null): () => void {
  const sync = () => {
    const userId = resolveUserId();
    if (userId && navigator.onLine) void runSync(userId).catch(() => {});
  };
  const flush = () => {
    const userId = resolveUserId();
    if (userId) void flushQueueOnHide(userId);
  };
  const onVisibility = () => (document.visibilityState === "hidden" ? flush() : sync());
  sync();
  window.addEventListener("online", sync);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("online", sync);
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibility);
  };
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
