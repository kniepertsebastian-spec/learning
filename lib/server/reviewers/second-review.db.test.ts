/** Zweitprüfung als Stichprobe gegen eine ECHTE Postgres-Datenbank. */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { approveCourse } from "@/lib/server/approvals/service";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals, courseReviewers, secondReviews, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { assignUnassignedSamples, countPendingSecondReviews, createSecondReviewSample, decideSecondReview, getSecondReviewOverview, listPendingSecondReviews } from "./second-review";

const run = TEST_DB ? describe : describe.skip;

run("Zweitprüfung (echte DB)", () => {
  const userIds: string[] = [];
  const certIds: string[] = [];

  async function setup(questions: number, reviewers: number) {
    const course = await seedCourse(questions);
    certIds.push(course.certId);
    const people: string[] = [];
    for (let i = 0; i < reviewers; i++) {
      const id = await seedUser();
      userIds.push(id);
      await getDb().update(users).set({ role: "reviewer" }).where(eq(users.id, id));
      await getDb().insert(courseReviewers).values({ certificationId: course.certId, userId: id });
      people.push(id);
    }
    return { course, people };
  }
  async function approval(certId: string, questionIds: string[], approver: string | null) {
    const fingerprints = { sections: {}, questions: Object.fromEntries(questionIds.map((id) => [id, "h"])) };
    const [row] = await getDb().insert(courseApprovals).values({ certificationId: certId, kind: "approval", reviewerUserId: approver, reviewerDisplayName: "Prüfer", contentHash: randomUUID(), fingerprints, versionLabel: "1.0" }).returning();
    return row;
  }

  afterAll(async () => {
    const db = getDb();
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  });

  it("legt je Freigabe eine Stichprobe an: Anteil der Fragen, ein zweiter Prüfer, nie der Freigebende, idempotent", async () => {
    const { course, people } = await setup(30, 2);
    const row = await approval(course.certId, course.questionIds, people[0]);
    expect(await createSecondReviewSample(row.id, 0.1)).toBe(3); // 10 % von 30, mindestens drei
    const rows = await getDb().select().from(secondReviews).where(eq(secondReviews.approvalId, row.id));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.reviewerUserId))).toEqual(new Set([people[1]]));
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(await createSecondReviewSample(row.id, 0.1)).toBe(0); // zweiter Aufruf: nichts Neues
    expect(await createSecondReviewSample(row.id, 0)).toBe(0); // abgeschaltet
    expect(await countPendingSecondReviews(people[1])).toBe(3);
    expect(await countPendingSecondReviews(people[0])).toBe(0);
  });

  it("nur ein Prüfer im Kurs: die Stichprobe wartet ohne zweiten Prüfer, bis jemand zugewiesen wird (nie der Freigebende)", async () => {
    const { course, people } = await setup(30, 1);
    const row = await approval(course.certId, course.questionIds, people[0]);
    expect(await createSecondReviewSample(row.id, 0.1)).toBe(3);
    expect((await getSecondReviewOverview()).unassigned).toBeGreaterThanOrEqual(3);
    expect(await assignUnassignedSamples(course.certId, people[0])).toBe(0); // der Freigebende prüft sich nicht selbst

    const newcomer = await seedUser();
    userIds.push(newcomer);
    expect(await assignUnassignedSamples(course.certId, newcomer)).toBe(3);
    expect(await countPendingSecondReviews(newcomer)).toBe(3);
  });

  it("das Urteil: nur der Zugewiesene, nur einmal, „stimmt nicht“ nur mit Begründung; Abweichungen stehen beim Admin", async () => {
    const { course, people } = await setup(30, 2);
    const row = await approval(course.certId, course.questionIds, people[0]);
    await createSecondReviewSample(row.id, 0.1);
    const items = await listPendingSecondReviews(people[1]);
    expect(items).toHaveLength(3);
    expect(items[0].question.options.length + (items[0].question.solution ? 1 : 0)).toBeGreaterThanOrEqual(0);
    const [first, second] = items;

    expect(await decideSecondReview({ id: first.id, reviewerUserId: people[0], verdict: "agree" })).toBe("not_found"); // fremder Prüfer
    expect(await decideSecondReview({ id: first.id, reviewerUserId: people[1], verdict: "disagree" })).toBe("comment_required");
    expect(await decideSecondReview({ id: first.id, reviewerUserId: people[1], verdict: "disagree", comment: "  " })).toBe("comment_required");
    expect(await decideSecondReview({ id: first.id, reviewerUserId: people[1], verdict: "agree" })).toBe("ok");
    expect(await decideSecondReview({ id: first.id, reviewerUserId: people[1], verdict: "disagree", comment: "doch falsch" })).toBe("already_decided");
    expect(await decideSecondReview({ id: second.id, reviewerUserId: people[1], verdict: "disagree", comment: "Antwort B ist nach der aktuellen Version falsch" })).toBe("ok");

    expect(await countPendingSecondReviews(people[1])).toBe(1);
    const overview = await getSecondReviewOverview();
    const mine = overview.deviations.filter((d) => d.id === second.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ comment: "Antwort B ist nach der aktuellen Version falsch", courseName: expect.any(String), versionLabel: "1.0" });
    expect(overview.deviations.some((d) => d.id === first.id)).toBe(false); // Zustimmung ist keine Abweichung
  });

  it("die Freigabe selbst legt die Stichprobe an und scheitert nie daran", async () => {
    const { course, people } = await setup(40, 2);
    const entry = await approveCourse({ certificationId: course.certId, reviewer: { userId: people[0], displayName: "Prüfer Z" }, confirmed: true, recordedByUserId: null });
    const rows = await getDb().select().from(secondReviews).where(eq(secondReviews.approvalId, entry.id));
    expect(rows).toHaveLength(4); // 10 % von 40
    expect(new Set(rows.map((r) => r.reviewerUserId))).toEqual(new Set([people[1]]));
  });
});
