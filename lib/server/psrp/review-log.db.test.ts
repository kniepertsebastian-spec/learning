/**
 * Phase 1 (Akzeptanz): ein Review erzeugt genau einen Log-Eintrag, Logs sind unveränderlich,
 * Löschen des Nutzers entfernt alles. Nur mit TEST_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, reviewItems, reviewLog, users } from "@/lib/server/db/schema";
import { getItemBaseTimeMs } from "./review-log";
import { recordRatedReviews } from "./service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

run("Review-Log (echte DB)", () => {
  let userId = "";
  let questionIds: string[] = [];

  beforeAll(async () => {
    userId = await seedUser("Asia/Tokyo");
    ({ questionIds } = await seedCourse(2));
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("ein Review erzeugt genau einen Log-Eintrag mit Rohrating und lokaler Zeit", async () => {
    const at = new Date("2026-03-02T20:30:00Z"); // 05:30 Montag? → Dienstag 05:30 in Tokyo
    await recordRatedReviews(userId, [{ itemId: questionIds[0], rawRating: 3, responseTimeMs: 4000 }], { now: at });
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rawRating: 3, localHour: 5, weekday: 2, reviewType: "card", responseTimeMs: 4000 });
    expect(rows[0].predictedR).toBeNull();
    const [state] = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    expect(state.reps).toBe(1);
    const [queue] = await getDb().select().from(reviewItems).where(eq(reviewItems.userId, userId));
    expect(queue.dueAt.getTime()).toBe(state.due.getTime());
  });

  it("zweites Review speichert die vorhergesagte Abrufwahrscheinlichkeit", async () => {
    await recordRatedReviews(userId, [{ itemId: questionIds[0], rawRating: 4 }], {
      now: new Date("2026-03-06T10:00:00Z"),
    });
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => r.rawRating === 4)!;
    expect(second.predictedR).toBeGreaterThan(0);
    expect(second.predictedR).toBeLessThanOrEqual(1);
  });

  it("Log-Einträge lassen sich weder ändern noch löschen", async () => {
    const db = getDb();
    await expect(db.update(reviewLog).set({ rawRating: 1 }).where(eq(reviewLog.userId, userId))).rejects.toThrow();
    await expect(db.delete(reviewLog).where(eq(reviewLog.userId, userId))).rejects.toThrow();
    expect(await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).toHaveLength(2);
  });

  it("Basiszeit: Median je Item, sonst Kursdurchschnitt, sonst null", async () => {
    await recordRatedReviews(userId, [{ itemId: questionIds[1], rawRating: 3 }], { now: new Date("2026-03-07T10:00:00Z") });
    // Item 0 hat nur 4000 ms (ein Wert), Item 1 hat keine Zeit → Kursdurchschnitt
    expect(await getItemBaseTimeMs(questionIds[0])).toBe(4000);
    expect(await getItemBaseTimeMs(questionIds[1])).toBe(4000);
  });

  it("Löschen des Nutzers entfernt Log und Zustand", async () => {
    const other = await seedUser();
    await recordRatedReviews(other, [{ itemId: questionIds[0], rawRating: 2 }]);
    await getDb().delete(users).where(eq(users.id, other));
    expect(await getDb().select().from(reviewLog).where(eq(reviewLog.userId, other))).toHaveLength(0);
    expect(await getDb().select().from(itemStates).where(eq(itemStates.userId, other))).toHaveLength(0);
  });
});
