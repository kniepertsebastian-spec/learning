import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";

/**
 * Beendet alle Sitzungen der Person auf allen Geräten (Aufgabe 20): Die Sitzungsversion steigt,
 * damit lehnt der jwt-Callback (lib/server/session-validity.ts) jedes vorher ausgestellte Token ab.
 * Abmelden ruft das auf, damit ein kopiertes oder gestohlenes Token nach dem Abmelden nicht mehr gilt.
 */
export async function endAllSessions(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}
