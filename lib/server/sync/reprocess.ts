import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { syncEvents } from "@/lib/server/db/schema";

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
