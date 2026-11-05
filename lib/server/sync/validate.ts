import { z } from "zod";
import type { SyncEventResult, SyncEventInput } from "@/lib/server/sync/service";

/**
 * Obergrenze je Anfrage. Der Client schickt seine ganze Warteschlange in einem Request und behandelt Ereignisse ohne Antwort
 * als „noch offen“ (lib/client/sync-core.ts): was über der Grenze liegt, wird nicht bearbeitet und geht beim nächsten Sync mit.
 */
export const MAX_SYNC_EVENTS_PER_REQUEST = 200;
/** Größte angenommene Anfrage (Bytes). Eine volle Charge Quiz-Antworten ist weit kleiner. */
export const MAX_SYNC_BODY_BYTES = 5 * 1024 * 1024;

const eventSchema = z.object({
  clientEventId: z.string().min(1).max(100),
  type: z.enum(["section_quiz", "study_session", "simulation_result"]),
  clientCreatedAt: z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value)), "kein gültiges Datum"),
  payload: z.unknown(),
});

export const syncBodySchema = z.object({
  userId: z.string().optional(),
  events: z.array(z.unknown()),
});

export interface SplitSyncEvents {
  valid: SyncEventInput[];
  /** Endgültig abgelehnte Ereignisse (ungültige Form): der Client zählt sie nach wenigen Antworten als abgelehnt. */
  rejected: SyncEventResult[];
  /** Wie viele Ereignisse wegen der Obergrenze noch nicht bearbeitet wurden. */
  deferred: number;
}

/**
 * Prüft jedes Ereignis einzeln. Ein kaputtes Ereignis darf weder die ganze Charge noch die übrigen blockieren, und ein ungültiges
 * Datum würde sonst erst beim Schreiben in die Datenbank auffallen (Ausnahme für die gesamte Anfrage).
 */
export function splitSyncEvents(rawEvents: unknown[]): SplitSyncEvents {
  const considered = rawEvents.slice(0, MAX_SYNC_EVENTS_PER_REQUEST);
  const valid: SyncEventInput[] = [];
  const rejected: SyncEventResult[] = [];
  const seen = new Set<string>();

  for (const raw of considered) {
    const parsed = eventSchema.safeParse(raw);
    if (parsed.success) {
      // Dieselbe Kennung zweimal in einer Charge: nur das erste Ereignis zählt (das zweite wäre ohnehin „bereits angewendet“).
      if (seen.has(parsed.data.clientEventId)) continue;
      seen.add(parsed.data.clientEventId);
      valid.push(parsed.data);
      continue;
    }
    const id = typeof (raw as { clientEventId?: unknown } | null)?.clientEventId === "string" ? (raw as { clientEventId: string }).clientEventId : null;
    // Ohne lesbare Kennung kann der Client keine Antwort zuordnen; es bleibt bei ihm liegen.
    if (id) rejected.push({ clientEventId: id.slice(0, 100), status: "error", error: "Ungültiges Ereignis.", terminal: true });
  }

  return { valid, rejected, deferred: Math.max(0, rawEvents.length - considered.length) };
}
