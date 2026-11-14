/** Aufgabe 02b (Review 12.11.2026): Bereinigungsskript für verwaiste Sync-Claims. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { syncEvents } from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";
import { releaseStaleClaims } from "./reprocess";
import { PROCESSING_MESSAGE, STALE_CLAIM_MS } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function insertEvent(userId: string, ageMs: number, overrides: Partial<typeof syncEvents.$inferInsert> = {}) {
  const [row] = await getDb()
    .insert(syncEvents)
    .values({
      userId,
      clientEventId: crypto.randomUUID(),
      type: "study_session",
      status: "error",
      errorMessage: PROCESSING_MESSAGE,
      clientCreatedAt: new Date(),
      createdAt: new Date(Date.now() - ageMs),
      ...overrides,
    })
    .returning();
  return row;
}

const exists = async (id: string) => (await getDb().select().from(syncEvents).where(eq(syncEvents.id, id))).length === 1;

run("Bereinigungsskript für verwaiste Claims (echte DB)", () => {
  it("Trockenlauf zählt die verwaisten Zeilen je Person und ändert nichts", async () => {
    const userId = await seedUser();
    const a = await insertEvent(userId, STALE_CLAIM_MS + 60_000);
    const b = await insertEvent(userId, STALE_CLAIM_MS * 3);

    const result = await releaseStaleClaims({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.released).toBe(0);
    expect(result.byUser.find((r) => r.userId === userId)?.count).toBe(2);
    expect(await exists(a.id)).toBe(true);
    expect(await exists(b.id)).toBe(true);
  });

  it("Ausführung gibt nur verwaiste Claims frei: junge Claims und abgeschlossene Ereignisse bleiben", async () => {
    const userId = await seedUser();
    const stale = await insertEvent(userId, STALE_CLAIM_MS + 60_000);
    const young = await insertEvent(userId, 60_000);
    const applied = await insertEvent(userId, STALE_CLAIM_MS * 3, { status: "applied", errorMessage: null });
    const failed = await insertEvent(userId, STALE_CLAIM_MS * 3, { errorMessage: "Session nicht gefunden" });

    const result = await releaseStaleClaims({ dryRun: false });
    expect(result.released).toBeGreaterThanOrEqual(1);
    expect(await exists(stale.id)).toBe(false);
    expect(await exists(young.id)).toBe(true);
    expect(await exists(applied.id)).toBe(true);
    expect(await exists(failed.id)).toBe(true);

    // Danach ist für diese Person kein Claim älter als die Schwelle übrig, und ein zweiter Lauf findet nichts.
    const again = await releaseStaleClaims({ dryRun: true });
    expect(again.byUser.find((r) => r.userId === userId)).toBeUndefined();
    const left = await getDb()
      .select()
      .from(syncEvents)
      .where(and(eq(syncEvents.userId, userId), eq(syncEvents.errorMessage, PROCESSING_MESSAGE)));
    expect(left.map((r) => r.id)).toEqual([young.id]);
  });

  it("eine noch laufende Verbuchung wird nicht gelöscht, auch wenn ihre Zeile älter als die Schwelle ist", async () => {
    const userId = await seedUser();
    const claim = await insertEvent(userId, STALE_CLAIM_MS + 60_000);
    const db = getDb();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const slow = db.transaction(async (tx) => {
      await tx.select().from(syncEvents).where(eq(syncEvents.id, claim.id)).for("update");
      locked();
      await gate;
      await tx.update(syncEvents).set({ status: "applied", errorMessage: null }).where(eq(syncEvents.id, claim.id));
    });
    await isLocked;
    // Die Bereinigung wartet auf das Ende der Verbuchung und prüft die Bedingung danach erneut.
    const cleanup = releaseStaleClaims({ dryRun: false });
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await slow;
    await cleanup;

    const [after] = await db.select().from(syncEvents).where(eq(syncEvents.id, claim.id));
    expect(after?.status).toBe("applied");
  });
});
