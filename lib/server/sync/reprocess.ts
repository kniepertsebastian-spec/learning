import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { syncEvents } from "@/lib/server/db/schema";
import { PROCESSING_MESSAGE, STALE_CLAIM_MS } from "./service";

export interface ReleaseConflictsResult {
  dryRun: boolean;
  /** Anzahl der als `conflict` gespeicherten Ereignisse. */
  conflicts: number;
  byUser: Array<{ userId: string; count: number }>;
  /** Freigegebene (gelöschte) Einträge; 0 im Trockenlauf. */
  released: number;
}

/**
 * Datenintegrität über Zeit, Phase 3: Ereignisse, die früher als `conflict` endeten (Session anderswo abgeschlossen), wurden
 * nie verbucht und blockieren ihre `clientEventId`. Der Server speichert die Nutzdaten nicht - verarbeitet werden sie erneut,
 * wenn das Gerät sie noch einmal sendet (die Seite reiht lokale Konflikte einmalig wieder ein). Dieser Schritt gibt die
 * Sperre frei, indem die Konflikt-Einträge entfernt werden. Idempotent: ein zweiter Lauf findet nichts mehr.
 */
export async function releaseConflictEvents(options: { dryRun: boolean }): Promise<ReleaseConflictsResult> {
  const db = getDb();
  const rows = await db
    .select({ userId: syncEvents.userId, count: sql<number>`count(*)::int` })
    .from(syncEvents)
    .where(eq(syncEvents.status, "conflict"))
    .groupBy(syncEvents.userId);
  const conflicts = rows.reduce((sum, r) => sum + r.count, 0);
  let released = 0;
  if (!options.dryRun && conflicts > 0) {
    released = (await db.delete(syncEvents).where(eq(syncEvents.status, "conflict")).returning({ id: syncEvents.id })).length;
  }
  return { dryRun: options.dryRun, conflicts, byUser: rows, released };
}

export interface ReleaseStaleClaimsResult {
  dryRun: boolean;
  /** Anzahl der verwaisten Claim-Zeilen (Status `error`, „wird verarbeitet“, älter als STALE_CLAIM_MS). */
  stale: number;
  byUser: Array<{ userId: string; count: number }>;
  /** Freigegebene (gelöschte) Zeilen; 0 im Trockenlauf. */
  released: number;
}

/**
 * Aufgabe 02b (Review 12.11.2026): Seit 02a übernimmt der Server eine verwaiste Claim-Zeile beim nächsten Senden des Geräts.
 * Zeilen von Geräten, die nicht mehr senden, bleiben liegen. Dieser Schritt gibt sie frei. Es gilt dieselbe Bedingung wie
 * bei der Übernahme in `service.ts`: Status `error`, Text „wird verarbeitet“, älter als STALE_CLAIM_MS. Eine noch laufende
 * Verbuchung hält ihre Zeile bis zum Commit gesperrt; das DELETE wartet darauf und prüft die Bedingung danach erneut, löscht
 * also nichts Abgeschlossenes. Verbucht wurde bei einer verwaisten Zeile nie etwas (Verbuchung und Abschluss teilen sich eine
 * Transaktion). Idempotent: ein zweiter Lauf findet nichts mehr.
 */
export async function releaseStaleClaims(options: { dryRun: boolean; now?: Date }): Promise<ReleaseStaleClaimsResult> {
  const db = getDb();
  const threshold = new Date((options.now ?? new Date()).getTime() - STALE_CLAIM_MS);
  const isStale = and(
    eq(syncEvents.status, "error"),
    eq(syncEvents.errorMessage, PROCESSING_MESSAGE),
    lt(syncEvents.createdAt, threshold),
  );
  const rows = await db
    .select({ userId: syncEvents.userId, count: sql<number>`count(*)::int` })
    .from(syncEvents)
    .where(isStale)
    .groupBy(syncEvents.userId);
  const stale = rows.reduce((sum, r) => sum + r.count, 0);
  let released = 0;
  if (!options.dryRun && stale > 0) {
    released = (await db.delete(syncEvents).where(isStale).returning({ id: syncEvents.id })).length;
  }
  return { dryRun: options.dryRun, stale, byUser: rows, released };
}
