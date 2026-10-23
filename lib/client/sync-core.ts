/**
 * Übertragung der Warteschlange, unabhängig von `window`: Seite (lib/client/sync-queue.ts) und Service Worker
 * (app/sw.ts, Background Sync) nutzen dieselbe Logik. Alles, was es nur im Fenster gibt (localStorage, DOM-Ereignisse),
 * kommt über `SyncIo` herein. Relative Importe, weil der Service Worker ohne `@/`-Alias gebaut wird.
 */
import type { PendingSyncEvent } from "./offline-db";

export interface SyncApiResult {
  clientEventId: string;
  status: "applied" | "already_applied" | "conflict" | "error";
  resultSummary?: unknown;
  error?: string;
}

export interface SyncQueueSummary {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  /** Der Server hat die Anmeldung abgelehnt (401/403): die Ereignisse bleiben unverändert liegen, bis die Person angemeldet ist. */
  authRequired: boolean;
}

export interface SyncIo {
  list(userId: string): Promise<PendingSyncEvent[]>;
  save(event: PendingSyncEvent): Promise<void>;
  remove(clientEventId: string): Promise<void>;
  post(body: unknown): Promise<Pick<Response, "ok" | "status" | "json">>;
  /** Mindestens ein Ereignis ist angekommen (Seite: Zeitpunkt merken; Service Worker: die Fenster benachrichtigen). */
  onTransferred(userId: string, atIso: string): void | Promise<void>;
}

export function summarize(events: PendingSyncEvent[], lastSyncedAt: string | null, authRequired = false): SyncQueueSummary {
  return {
    pendingCount: events.filter((e) => e.status === "pending" || e.status === "syncing").length,
    failedCount: events.filter((e) => e.status === "failed").length,
    conflictCount: events.filter((e) => e.status === "conflict").length,
    lastSyncedAt,
    authRequired,
  };
}

/**
 * Überträgt `pending` und `failed`; `conflict` wird nie automatisch erneut versucht. Bei 401/403 bleibt alles
 * unverändert („Anmeldung nötig“, kein Fehlversuch). `networkFailed` ist wahr, wenn der Server nicht erreichbar war
 * oder die Antwort unbrauchbar ist: der Service Worker lässt den Sync dann vom Browser wiederholen.
 */
export async function transferPendingEvents(
  userId: string,
  io: SyncIo,
  lastSyncedAt: () => string | null,
): Promise<{ summary: SyncQueueSummary; networkFailed: boolean }> {
  const events = await io.list(userId);
  const toSync = events.filter((e) => e.status === "pending" || e.status === "failed");
  let authRequired = false;
  let networkFailed = false;

  if (toSync.length > 0) {
    let apiResults: SyncApiResult[] | null = null;
    try {
      const response = await io.post({
        userId,
        events: toSync.map((e) => ({ clientEventId: e.clientEventId, type: e.type, clientCreatedAt: e.createdAt, payload: e.payload })),
      });
      if (response.ok) {
        apiResults = ((await response.json()) as { results: SyncApiResult[] }).results;
      } else if (response.status === 401 || response.status === 403) {
        authRequired = true;
      }
    } catch {
      apiResults = null;
    }

    if (apiResults) {
      const resultByEventId = new Map(apiResults.map((r) => [r.clientEventId, r]));
      let anySucceeded = false;
      for (const event of toSync) {
        const result = resultByEventId.get(event.clientEventId);
        if (!result) continue;
        if (result.status === "applied" || result.status === "already_applied") {
          await io.remove(event.clientEventId);
          anySucceeded = true;
        } else if (result.status === "conflict") {
          await io.save({ ...event, status: "conflict", lastError: result.error ?? null });
        } else {
          await io.save({ ...event, status: "failed", attempts: event.attempts + 1, lastError: result.error ?? "Sync fehlgeschlagen." });
        }
      }
      if (anySucceeded) await io.onTransferred(userId, new Date().toISOString());
    } else if (!authRequired) {
      networkFailed = true;
      for (const event of toSync) {
        await io.save({ ...event, status: "failed", attempts: event.attempts + 1, lastError: "Netzwerkfehler beim Synchronisieren." });
      }
    }
  }

  return { summary: summarize(await io.list(userId), lastSyncedAt(), authRequired), networkFailed };
}
