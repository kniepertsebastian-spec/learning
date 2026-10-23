/** Frühwarnung gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { engagementStates, itemStates, reviewLog, studySessions } from "@/lib/server/db/schema";
import { buildReviewLogRow } from "@/lib/server/psrp/review-log";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { declineDeescalatedSession, startStudySession } from "@/lib/server/study/session-service";
import { afterDeescalatedSession } from "./service";

const run = TEST_DB ? describe : describe.skip;
const daysAgo = (d: number, extraMin = 0) => new Date(Date.now() - d * 86_400_000 - extraMin * 60_000);

async function seedUserWithHistory(certId: string, itemId: string, opts: { abandoned: number; windowErrors: number }) {
  const userId = await seedUser();
  const db = getDb();
  const row = (i: number, ageDays: number, rating: 1 | 3) =>
    buildReviewLogRow({ userId, itemId, sessionId: randomUUID(), timestamp: daysAgo(ageDays, i), timeZone: "UTC", rawRating: rating });
  await db.insert(reviewLog).values([
    ...Array.from({ length: 40 }, (_, i) => row(i, 12, i < 4 ? 1 : 3)),
    ...Array.from({ length: 12 }, (_, i) => row(i, 1, i < opts.windowErrors ? 1 : 3)),
  ]);
  for (let i = 0; i < opts.abandoned; i++) {
    await db.insert(studySessions).values({ userId, certificationId: certId, status: "abandoned", goalType: "minutes", goalValue: 5, plannedAt: daysAgo(i + 1) });
  }
  return userId;
}

run("Frühwarnung (echte DB)", () => {
  it("Muster aus Abbrüchen und Fehlerquote entlastet die Planung; FSRS-Zustand und Rohlog bleiben unverändert", async () => {
    const course = await seedCourse(4);
    const userId = await seedUserWithHistory(course.certId, course.questionIds[0], { abandoned: 3, windowErrors: 6 });
    const due = new Date(Date.now() - 3_600_000);
    await getDb().insert(itemStates).values(course.questionIds.map((itemId) => ({ userId, itemId, stability: 3, difficulty: 5, reps: 3, lapses: 0, fsrsState: 2, lastReview: daysAgo(5), due })));
    const statesBefore = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    const logsBefore = (await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).length;

    const session = await startStudySession(userId, course.certId, 10);
    expect(session.deescalated).toBe(true);
    const [state] = await getDb().select().from(engagementStates).where(eq(engagementStates.userId, userId));
    expect(state.status).toBe("deescalated");
    expect(state.signals.map((s) => s.kind)).toEqual(expect.arrayContaining(["short_sessions", "high_error_rate"]));
    expect(session.itemCount).toBeLessThanOrEqual(4);

    const statesAfter = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    expect(statesAfter.map((s) => [s.itemId, s.stability, s.difficulty, s.due.getTime()]).sort()).toEqual(statesBefore.map((s) => [s.itemId, s.stability, s.difficulty, s.due.getTime()]).sort());
    expect((await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).length).toBe(logsBefore);
  });

  it("ein einzelnes Signal oder zu wenige Abbrüche lösen nichts aus", async () => {
    const course = await seedCourse(2);
    const userId = await seedUserWithHistory(course.certId, course.questionIds[0], { abandoned: 1, windowErrors: 6 });
    const session = await startStudySession(userId, course.certId, 10);
    expect(session.deescalated).toBe(false);
    expect(await getDb().select().from(engagementStates).where(eq(engagementStates.userId, userId))).toHaveLength(0);
  });

  it("„Nein danke“ baut normal neu und löst eine Weile nicht erneut aus", async () => {
    const course = await seedCourse(2);
    const userId = await seedUserWithHistory(course.certId, course.questionIds[0], { abandoned: 3, windowErrors: 6 });
    const session = await startStudySession(userId, course.certId, 10);
    expect(session.deescalated).toBe(true);
    const next = await declineDeescalatedSession(session.id, userId);
    expect(next?.deescalated).toBe(false);
    expect(next?.id).not.toBe(session.id);
    const [state] = await getDb().select().from(engagementStates).where(eq(engagementStates.userId, userId));
    expect(state.status).toBe("normal");
    expect(state.declinedUntil!.getTime()).toBeGreaterThan(Date.now());
    // ohne entlastete Session kein „Nein danke“
    expect(await declineDeescalatedSession(next!.id, userId)).toBeNull();
  });

  it("Rückkehr zum Normalzustand nach der Dauer in Sessions", async () => {
    const course = await seedCourse(2);
    const userId = await seedUserWithHistory(course.certId, course.questionIds[0], { abandoned: 3, windowErrors: 6 });
    await startStudySession(userId, course.certId, 10);
    for (let i = 0; i < 3; i++) await afterDeescalatedSession(userId);
    const [state] = await getDb().select().from(engagementStates).where(eq(engagementStates.userId, userId));
    expect(state.status).toBe("normal");
    expect(state.sessionsLeft).toBe(0);
  });

  it("ist mit FEATURE_DROPOUT_GUARD=0 abschaltbar", async () => {
    const course = await seedCourse(2);
    const userId = await seedUserWithHistory(course.certId, course.questionIds[0], { abandoned: 3, windowErrors: 6 });
    process.env.FEATURE_DROPOUT_GUARD = "0";
    try {
      expect((await startStudySession(userId, course.certId, 10)).deescalated).toBe(false);
    } finally {
      delete process.env.FEATURE_DROPOUT_GUARD;
    }
  });
});
