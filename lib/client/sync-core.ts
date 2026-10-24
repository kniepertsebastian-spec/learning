/**
 * Übertragung der Warteschlange, unabhängig von `window`: Seite (lib/client/sync-queue.ts) und Service Worker
 * (app/sw.ts, Background Sync) nutzen dieselbe Logik. Alles, was es nur im Fenster gibt (localStorage, DOM-Ereignisse),
 * kommt über `SyncIo` herein. Relative Importe, weil der Service Worker ohne `@/`-Alias gebaut wird.
 */
import type { PendingSyncEvent } from "./offline-db";

export interface SyncApiResult {
  clientEventId: string;
  status: "applied" | "applied_partial" | "already_applied" | "conflict" | "error";
  resultSummary?: unknown;
  error?: string;
  /** Endgültig abgelehnt (derselbe Fehler bei jedem Senden). */
  terminal?: boolean;
}

/** So viele gleichlautende endgültige Antworten, bis ein Ereignis als abgelehnt gilt und nicht mehr gesendet wird. */
export const REJECT_AFTER_SAME_ERRORS = 3;

export interface SyncQueueSummary {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  /** Endgültig abgelehnte Ergebnisse (werden nicht mehr gesendet). */
  rejectedCount: number;
  lastSyncedAt: string | null;
  /** Älteste noch nicht übertragene Ergebnisse (ausstehend oder fehlgeschlagen): Zeitpunkt der Aufzeichnung. */
  oldestUnsyncedAt: string | null;
  /** Nur nach einer Übertragung: so viele Antworten betrafen Fragen, die es nicht mehr gibt, und wurden übersprungen. */
  skippedAnswers?: number;
  /** Nur nach einer Übertragung: so viele Sessions waren schon abgeschlossen, ihre Antworten wurden trotzdem gezählt. */
  partialApplied?: number;
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

export function summarize(events: PendingSyncEvent[], lastSyncedAt: string | null, authRequired = false, partialApplied = 0, skippedAnswers = 0): SyncQueueSummary {
  const unsynced = events.filter((e) => e.status === "pending" || e.status === "syncing" || e.status === "failed").map((e) => e.createdAt).sort();
  return {
    oldestUnsyncedAt: unsynced[0] ?? null,
    pendingCount: events.filter((e) => e.status === "pending" || e.status === "syncing").length,
    failedCount: events.filter((e) => e.status === "failed").length,
    conflictCount: events.filter((e) => e.status === "conflict").length,
    rejectedCount: events.filter((e) => e.status === "rejected").length,
    lastSyncedAt,
    authRequired,
    ...(partialApplied > 0 ? { partialApplied } : {}),
    ...(skippedAnswers > 0 ? { skippedAnswers } : {}),
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
  let partialApplied = 0;
  let skippedAnswers = 0;

  if (toSync.length > 0) {
    let apiResults: SyncApiResult[] | null = null;
    try {
      const response = await io.post({
        userId,
        events: toSync.map(toRequestEvent),
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
        if (result.status === "applied" || result.status === "applied_partial" || result.status === "already_applied") {
          await io.remove(event.clientEventId);
          anySucceeded = true;
          if (result.status === "applied_partial") partialApplied++;
          skippedAnswers += (result.resultSummary as { skipped?: number } | null | undefined)?.skipped ?? 0;
        } else if (result.status === "conflict") {
          await io.save({ ...event, status: "conflict", lastError: result.error ?? null });
        } else if (result.terminal && result.error) {
          // Derselbe endgültige Fehler wie zuvor: nach genügend Wiederholungen nicht mehr senden (die Person entscheidet).
          const terminalCount = event.lastError === result.error ? (event.terminalCount ?? 0) + 1 : 1;
          await io.save({ ...event, status: terminalCount >= REJECT_AFTER_SAME_ERRORS ? "rejected" : "failed", attempts: event.attempts + 1, lastError: result.error, terminalCount });
        } else {
          await io.save({ ...event, status: "failed", attempts: event.attempts + 1, lastError: result.error ?? "Sync fehlgeschlagen.", terminalCount: 0 });
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

  return { summary: summarize(await io.list(userId), lastSyncedAt(), authRequired, partialApplied, skippedAnswers), networkFailed };
}

/** `fetch` mit `keepalive` darf höchstens 64 KB Body senden; darunter bleiben wir mit Spielraum für den Rahmen. */
export const KEEPALIVE_MAX_BYTES = 60_000;

interface SyncRequestEvent {
  clientEventId: string;
  type: string;
  clientCreatedAt: string;
  payload: unknown;
}

export function toRequestEvent(event: PendingSyncEvent): SyncRequestEvent {
  return { clientEventId: event.clientEventId, type: event.type, clientCreatedAt: event.createdAt, payload: event.payload };
}

/**
 * Teilt Ereignisse in Anfragen von höchstens `maxBytes` (JSON, UTF-8). Ein einzelnes Ereignis über der Grenze passt in
 * keine `keepalive`-Anfrage und bleibt für die normale Übertragung beim nächsten Start liegen (`skipped`).
 */
export function chunkForKeepalive(events: PendingSyncEvent[], userId: string, maxBytes = KEEPALIVE_MAX_BYTES): { chunks: SyncRequestEvent[][]; skipped: PendingSyncEvent[] } {
  const size = (batch: SyncRequestEvent[]) => new TextEncoder().encode(JSON.stringify({ userId, events: batch })).length;
  const chunks: SyncRequestEvent[][] = [];
  const skipped: PendingSyncEvent[] = [];
  let current: SyncRequestEvent[] = [];
  for (const event of events) {
    const request = toRequestEvent(event);
    if (size([request]) > maxBytes) {
      skipped.push(event);
      continue;
    }
    if (current.length > 0 && size([...current, request]) > maxBytes) {
      chunks.push(current);
      current = [];
    }
    current.push(request);
  }
  if (current.length > 0) chunks.push(current);
  return { chunks, skipped };
}
