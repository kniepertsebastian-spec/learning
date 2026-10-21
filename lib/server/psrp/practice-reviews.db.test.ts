/** Praxisaufgaben als implizite Reviews gegen echte DB (nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { organizationMemberships, organizations, practiceTaskSubmissions, practiceTasks, reviewLog, users } from "@/lib/server/db/schema";
import { applyReviewedPracticeTasks } from "./practice-reviews";
import { recordRatedReviews } from "./service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

run("Praxisaufgaben → implizite Reviews (echte DB)", () => {
  let userId = "";
  let orgId = "";
  let certId = "";
  let objectiveId = "";
  let questionIds: string[] = [];

  beforeAll(async () => {
    userId = await seedUser();
    ({ certId, objectiveId, questionIds } = await seedCourse(3));
    const [org] = await getDb().insert(organizations).values({ name: "Testfirma" }).returning();
    orgId = org.id;
    await getDb().insert(organizationMemberships).values({ organizationId: orgId, userId, role: "learner" });
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
    await getDb().delete(organizations).where(eq(organizations.id, orgId));
  });

  async function submission(status: "confirmed" | "rework", withObjective = true) {
    const [task] = await getDb()
      .insert(practiceTasks)
      .values({ organizationId: orgId, certificationId: certId, title: "Aufgabe", objectiveId: withObjective ? objectiveId : null })
      .returning();
    const [sub] = await getDb()
      .insert(practiceTaskSubmissions)
      .values({ taskId: task.id, organizationId: orgId, userId, status })
      .returning();
    return sub.id;
  }

  it("bestätigt zählt als gelöst, nur für bereits bekannte Fragen; Verarbeitung nur einmal", async () => {
    await recordRatedReviews(userId, [{ itemId: questionIds[0], rawRating: 3 }], { now: new Date("2026-03-01T10:00:00Z") });
    const id = await submission("confirmed");
    expect(await applyReviewedPracticeTasks(userId, new Date("2026-03-05T10:00:00Z"))).toBe(1);
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    const implicit = rows.filter((r) => r.reviewType === "interleaved");
    expect(implicit).toHaveLength(1);
    expect(implicit[0]).toMatchObject({ itemId: questionIds[0], rawRating: 3 });
    const [sub] = await getDb().select().from(practiceTaskSubmissions).where(eq(practiceTaskSubmissions.id, id));
    expect(sub.learnedAt).not.toBeNull();
    expect(await applyReviewedPracticeTasks(userId)).toBe(0);
  });

  it("Nacharbeit zählt als nicht gelöst; ohne Lernziel passiert nichts", async () => {
    await submission("rework");
    expect(await applyReviewedPracticeTasks(userId, new Date("2026-03-06T10:00:00Z"))).toBe(1);
    const rows = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(rows.filter((r) => r.reviewType === "interleaved").map((r) => r.rawRating).sort()).toEqual([1, 3]);
    await submission("confirmed", false);
    expect(await applyReviewedPracticeTasks(userId)).toBe(0);
  });
});
