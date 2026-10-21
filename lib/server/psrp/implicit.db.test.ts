/** Phase 6 gegen echte DB: implizite Reviews und Skip-Erkennung. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, reviewLog, users } from "@/lib/server/db/schema";
import { applyChapterSkip, implicitRating, linkTaskItems, recordInterleavedTask } from "./implicit";
import { recordRatedReviews } from "./service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

describe("Rating-Mapping", () => {
  it("gelöst → 3, nicht gelöst → 1 (konfigurierbar)", () => {
    expect(implicitRating(true)).toBe(3);
    expect(implicitRating(false)).toBe(1);
    expect(implicitRating(true, { solved: 4, failed: 2 })).toBe(4);
  });
});

run("Implizite Reviews (echte DB)", () => {
  let userId = "";
  let objectiveId = "";
  let questionIds: string[] = [];
  const taskRef = `sec-${Math.random().toString(36).slice(2)}:0`;
  beforeAll(async () => {
    userId = await seedUser();
    ({ objectiveId, questionIds } = await seedCourse(3));
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("gelöste Aufgabe aktualisiert den Item-Zustand; das Log unterscheidet interleaved von card", async () => {
    await recordRatedReviews(userId, [{ itemId: questionIds[0], rawRating: 3 }], { now: new Date("2026-02-01T10:00:00Z") });
    await linkTaskItems("simulation", taskRef, [questionIds[0]]);
    const n = await recordInterleavedTask({ userId, taskType: "simulation", taskRef: taskRef, solved: true, now: new Date("2026-02-04T10:00:00Z") });
    expect(n).toBe(1);
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(rows.map((r) => r.reviewType).sort()).toEqual(["card", "interleaved"]);
    const [state] = await getDb().select().from(itemStates).where(eq(itemStates.itemId, questionIds[0]));
    expect(state.reps).toBe(2);
    expect(await recordInterleavedTask({ userId, taskType: "simulation", taskRef: "unbekannt", solved: true })).toBe(0);
  });

  it("Skip: bestandener Einstiegstest startet unbekannte Items mit Rating 4", async () => {
    const created = await applyChapterSkip(userId, objectiveId, new Date("2026-02-05T10:00:00Z"));
    expect(created).toBe(2); // das schon bekannte Item bleibt unberührt
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(rows.filter((r) => r.rawRating === 4 && r.reviewType === "interleaved")).toHaveLength(2);
    expect(await applyChapterSkip(userId, objectiveId)).toBe(0);
  });
});
