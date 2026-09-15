import type { SyncEventType } from "@/lib/server/db/schema";
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
}

export interface SyncQueueSummary {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
}

export async function getSyncQueueSummary(userId: string): Promise<SyncQueueSummary> {
  const events = await listPendingSyncEvents(userId);
  return {
    pendingCount: events.filter((e) => e.status === "pending" || e.status === "syncing").length,
    failedCount: events.filter((e) => e.status === "failed").length,
    conflictCount: events.filter((e) => e.status === "conflict").length,
    lastSyncedAt: getLastSyncedAt(userId),
  };
}

/** Ein dauerhafter Konflikt (z. B. Session anderswo bereits abgeschlossen)
 * wird nicht automatisch erneut versucht - der Nutzer kann ihn explizit
 * verwerfen, sobald er den Hinweis gesehen hat. */
export async function discardPendingSyncEvent(clientEventId: string): Promise<void> {
  await deletePendingSyncEvent(clientEventId);
  notifyQueueChanged();
}

interface SyncApiResult {
  clientEventId: string;
  status: "applied" | "already_applied" | "conflict" | "error";
  resultSummary?: unknown;
  error?: string;
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
  const events = await listPendingSyncEvents(userId);
  const toSync = events.filter((e) => e.status === "pending" || e.status === "failed");

  if (toSync.length > 0) {
    let apiResults: SyncApiResult[] | null = null;
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: toSync.map((e) => ({
            clientEventId: e.clientEventId,
            type: e.type,
            clientCreatedAt: e.createdAt,
            payload: e.payload,
          })),
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { results: SyncApiResult[] };
        apiResults = data.results;
      }
    } catch {
      apiResults = null; // Netzwerkfehler - unten als fehlgeschlagen markieren.
    }

    if (apiResults) {
      const resultByEventId = new Map(apiResults.map((r) => [r.clientEventId, r]));
      let anySucceeded = false;
      for (const event of toSync) {
        const result = resultByEventId.get(event.clientEventId);
        if (!result) continue;
        if (result.status === "applied" || result.status === "already_applied") {
          await deletePendingSyncEvent(event.clientEventId);
          anySucceeded = true;
        } else if (result.status === "conflict") {
          await savePendingSyncEvent({
            ...event,
            status: "conflict",
            lastError: result.error ?? null,
          });
        } else {
          await savePendingSyncEvent({
            ...event,
            status: "failed",
            attempts: event.attempts + 1,
            lastError: result.error ?? "Sync fehlgeschlagen.",
          });
        }
      }
      if (anySucceeded) setLastSyncedAt(userId, new Date().toISOString());
    } else {
      for (const event of toSync) {
        await savePendingSyncEvent({
          ...event,
          status: "failed",
          attempts: event.attempts + 1,
          lastError: "Netzwerkfehler beim Synchronisieren.",
        });
      }
    }
  }

  notifyQueueChanged();
  return getSyncQueueSummary(userId);
}
