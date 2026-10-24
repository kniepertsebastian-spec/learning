/** Datenintegrität über Zeit, Phase 1: offline beantwortet, Tage später synchronisiert, gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { ratingFromOutcome, recordRatedReviews } from "@/lib/server/psrp/service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { processSyncEvents } from "./service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const DAY = 86_400_000;

async function withOptions(questionId: string) {
  const [right] = await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: t("R"), isCorrect: true },
    { questionId, orderNum: 2, text: t("F"), isCorrect: false },
  ]).returning();
  return right.id;
}

async function plannedSession(userId: string, course: Awaited<ReturnType<typeof seedCourse>>, createdAt: Date) {
  const db = getDb();
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: createdAt, createdAt }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { session, items };
}

run("Zeitpunkt der Antwort (echte DB)", () => {
  it("Session am Tag 0 offline, Sync am Tag 7: gleicher Zustand, gleiche Log-Zeit, gleicher Abschluss wie online am Tag 0", async () => {
    const course = await seedCourse(2);
    const right = await Promise.all(course.questionIds.map(withOptions));
    const db = getDb();
    const day0 = new Date(Date.now() - 7 * DAY);
    day0.setUTCMilliseconds(0);

    const online = await seedUser();
    for (const itemId of course.questionIds) await recordRatedReviews(online, [{ itemId, rawRating: ratingFromOutcome(true, null) }], { now: day0 });

    const offline = await seedUser();
    const { session, items } = await plannedSession(offline, course, new Date(day0.getTime() - 3_600_000));
    const [result] = await processSyncEvents(offline, [
      {
        clientEventId: crypto.randomUUID(),
        type: "study_session",
        clientCreatedAt: day0.toISOString(),
        payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: right[i], answeredAt: day0.toISOString() })) },
      },
    ]);
    expect(result.status).toBe("applied");

    const stateOf = async (userId: string) => (await db.select().from(itemStates).where(eq(itemStates.userId, userId))).sort((a, b) => a.itemId.localeCompare(b.itemId));
    const [a, b] = [await stateOf(online), await stateOf(offline)];
    expect(b).toHaveLength(2);
    for (const [i, s] of b.entries()) {
      expect(s.stability).toBeCloseTo(a[i].stability, 6);
      expect(s.difficulty).toBeCloseTo(a[i].difficulty, 6);
      expect(s.due.getTime()).toBe(a[i].due.getTime());
      expect(s.lastReview?.getTime()).toBe(day0.getTime());
    }
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, offline));
    const refLogs = await db.select().from(reviewLog).where(eq(reviewLog.userId, online));
    expect(logs.map((l) => l.timestampUtc.getTime()).sort()).toEqual(refLogs.map((l) => l.timestampUtc.getTime()).sort());
    expect(logs.map((l) => [l.localHour, l.weekday]).sort()).toEqual(refLogs.map((l) => [l.localHour, l.weekday]).sort());
    expect(logs.every((l) => l.stateApplied)).toBe(true);
    const [done] = await db.select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(done.completedAt?.getTime()).toBe(day0.getTime());
  });

  it("trennt die Antworten einer langen Offline-Session nach ihrem Zeitpunkt", async () => {
    const course = await seedCourse(2);
    const right = await Promise.all(course.questionIds.map(withOptions));
    const userId = await seedUser();
    const base = Date.now() - 5 * DAY;
    const { session, items } = await plannedSession(userId, course, new Date(base - 1000));
    await processSyncEvents(userId, [
      {
        clientEventId: crypto.randomUUID(),
        type: "study_session",
        clientCreatedAt: new Date(base + 2 * 3_600_000).toISOString(),
        payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: right[i], answeredAt: new Date(base + i * 3_600_000).toISOString() })) },
      },
    ]);
    const logs = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(new Set(logs.map((l) => l.timestampUtc.getTime())).size).toBe(2);
    expect(Math.abs(logs.map((l) => l.timestampUtc.getTime()).sort()[1] - logs.map((l) => l.timestampUtc.getTime()).sort()[0])).toBe(3_600_000);
  });

  it("begrenzt eine Antwort aus der Zukunft auf die Serverzeit", async () => {
    const course = await seedCourse(1);
    const right = await withOptions(course.questionIds[0]);
    const userId = await seedUser();
    const { session, items } = await plannedSession(userId, course, new Date(Date.now() - DAY));
    const before = Date.now();
    await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: new Date(Date.now() + 3 * DAY).toISOString(), payload: { sessionId: session.id, answers: [{ itemId: items[0].id, selectedOptionId: right, answeredAt: new Date(Date.now() + 3 * DAY).toISOString() }] } },
    ]);
    const [log] = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(log.timestampUtc.getTime()).toBeGreaterThanOrEqual(before);
    expect(log.timestampUtc.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("eine spätere Online-Wiederholung bleibt maßgeblich: die verspätete Antwort wird nur protokolliert", async () => {
    const course = await seedCourse(1);
    const right = await withOptions(course.questionIds[0]);
    const userId = await seedUser();
    const db = getDb();
    const oldAnswer = new Date(Date.now() - 6 * DAY);
    const { session, items } = await plannedSession(userId, course, new Date(oldAnswer.getTime() - 1000));
    // Inzwischen online gelernt (jünger als die Offline-Antwort).
    await recordRatedReviews(userId, [{ itemId: course.questionIds[0], rawRating: 4 }], { now: new Date(Date.now() - 2 * DAY) });
    const [stateBefore] = await db.select().from(itemStates).where(and(eq(itemStates.userId, userId), eq(itemStates.itemId, course.questionIds[0])));
    await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: oldAnswer.toISOString(), payload: { sessionId: session.id, answers: [{ itemId: items[0].id, selectedOptionId: right, answeredAt: oldAnswer.toISOString() }] } },
    ]);
    const [stateAfter] = await db.select().from(itemStates).where(and(eq(itemStates.userId, userId), eq(itemStates.itemId, course.questionIds[0])));
    expect(stateAfter).toEqual(stateBefore);
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(logs).toHaveLength(2);
    expect(logs.filter((l) => !l.stateApplied)).toHaveLength(1);
    expect(logs.find((l) => !l.stateApplied)?.timestampUtc.getTime()).toBe(oldAnswer.getTime());
  });

  it("Ereignis älter als 30 Tage: Protokolleintrag ohne Zustandsänderung", async () => {
    const course = await seedCourse(1);
    const right = await withOptions(course.questionIds[0]);
    const userId = await seedUser();
    const old = new Date(Date.now() - 45 * DAY);
    const { session, items } = await plannedSession(userId, course, new Date(old.getTime() - 1000));
    await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: old.toISOString(), payload: { sessionId: session.id, answers: [{ itemId: items[0].id, selectedOptionId: right, answeredAt: old.toISOString() }] } },
    ]);
    const db = getDb();
    expect(await db.select().from(itemStates).where(eq(itemStates.userId, userId))).toHaveLength(0);
    const [log] = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(log.stateApplied).toBe(false);
    expect(log.timestampUtc.getTime()).toBe(old.getTime());
  });
});
