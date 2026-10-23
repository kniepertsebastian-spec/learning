/** Erste Antwort je Lernendem für die Plattformstatistik, gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { reviewLog } from "@/lib/server/db/schema";
import { buildReviewLogRow } from "@/lib/server/psrp/review-log";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { firstTryStats } from "./first-try";

const run = TEST_DB ? describe : describe.skip;

run("Erste Antwort je Lernendem (echte DB)", () => {
  it("zählt nur die erste Antwort jeder Person, spätere Wiederholungen nicht", async () => {
    const course = await seedCourse(1);
    const itemId = course.questionIds[0];
    const row = (userId: string, minutesAgo: number, rating: 1 | 3) =>
      buildReviewLogRow({ userId, itemId, sessionId: randomUUID(), timestamp: new Date(Date.now() - minutesAgo * 60_000), timeZone: "UTC", rawRating: rating });
    const [a, b, c] = await Promise.all([seedUser(), seedUser(), seedUser()]);
    await getDb().insert(reviewLog).values([
      row(a, 100, 1), row(a, 50, 3), // erst nicht gelöst, später gelöst: zählt als nicht gleich gelöst
      row(b, 90, 3), row(b, 40, 1), // gleich gelöst, später nicht: zählt als gelöst
      row(c, 80, 3),
    ]);
    expect(await firstTryStats(itemId)).toEqual({ answers: 3, notSolved: 1 });
    expect(await firstTryStats((await seedCourse(1)).questionIds[0])).toEqual({ answers: 0, notSolved: 0 });
  });
});
