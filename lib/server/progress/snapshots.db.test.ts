/** Fortschritts-Stände, Rückblick und Einschätzung gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { objectiveProgress, objectiveSnapshots, objectives, domains, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { getProgressView, recordObjectiveSnapshot } from "./snapshots";

const run = TEST_DB ? describe : describe.skip;
const now = new Date("2026-10-21T12:00:00Z");

run("Fortschritts-Stände (echte DB)", () => {
  it("zählt STRONG-Lernziele und überschreibt den Stand desselben Tages", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
    const [obj] = await getDb().select({ id: objectives.id }).from(objectives).innerJoin(domains, eq(domains.id, objectives.domainId)).where(eq(domains.certificationId, course.certId));
    expect(await recordObjectiveSnapshot(userId, course.certId, now)).toEqual({ day: "2026-10-21", secure: 0, total: 1 });
    await getDb().insert(objectiveProgress).values({ userId, objectiveId: obj.id, status: "STRONG", masteryScore: "90" });
    expect(await recordObjectiveSnapshot(userId, course.certId, now)).toEqual({ day: "2026-10-21", secure: 1, total: 1 });
    const rows = await getDb().select().from(objectiveSnapshots).where(and(eq(objectiveSnapshots.userId, userId), eq(objectiveSnapshots.certificationId, course.certId)));
    expect(rows).toHaveLength(1);
  });

  it("neue Person: kein Rückblick, nur der heutige Stand", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    const view = await getProgressView(userId, course.certId, now);
    expect(view.review).toBeNull();
    expect(view.series).toHaveLength(1);
  });

  it("Rückblick nach drei Wochen Verlauf", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
    await getDb().insert(objectiveSnapshots).values({ userId, certificationId: course.certId, day: "2026-09-30", secureObjectives: 0, totalObjectives: 1 });
    const view = await getProgressView(userId, course.certId, now);
    expect(view.review).not.toBeNull();
    expect(view.series.length).toBe(2);
  });
});
