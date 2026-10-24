/** Datenintegrität über Zeit, Phase 3: Konflikte ohne Datenverlust gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { objectiveProgress, questionOptions, quizAttempts, reviewLog, studySessionItems, studySessions, syncEvents } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { releaseConflictEvents } from "./reprocess";
import { processSyncEvents } from "./service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const DAY = 86_400_000;

async function withOptions(questionId: string) {
  const [right, wrong] = await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: t("R"), isCorrect: true },
    { questionId, orderNum: 2, text: t("F"), isCorrect: false },
  ]).returning();
  return { right: right.id, wrong: wrong.id };
}

async function sessionWithItems(userId: string, course: Awaited<ReturnType<typeof seedCourse>>, status: "planned" | "completed" | "skipped") {
  const db = getDb();
  const createdAt = new Date(Date.now() - 3 * DAY);
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status, goalType: "minutes", goalValue: 10, plannedAt: createdAt, createdAt, completedAt: status === "completed" ? new Date(Date.now() - DAY) : null }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { session, items };
}

run("Konflikte ohne Datenverlust (echte DB)", () => {
  it.each(["completed", "skipped"] as const)("Session inzwischen %s: Antworten zählen trotzdem als Wiederholungen", async (status) => {
    const course = await seedCourse(2);
    const options = await Promise.all(course.questionIds.map(withOptions));
    const userId = await seedUser();
    const { session, items } = await sessionWithItems(userId, course, status);
    const answeredAt = new Date(Date.now() - 2 * DAY);
    const [result] = await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: answeredAt.toISOString(), payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: options[i].right, answeredAt: answeredAt.toISOString() })) } },
    ]);
    expect(result.status).toBe("applied_partial");
    const db = getDb();
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.timestampUtc.getTime() === answeredAt.getTime())).toBe(true);
    const [after] = await db.select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(after.status).toBe(status);
    expect(after.completedAt?.getTime() ?? null).toBe(session.completedAt?.getTime() ?? null);
  });

  it("endet kein Ereignis mehr als conflict ohne verbuchte Wiederholungen; ein früherer Konflikt wird beim erneuten Senden verarbeitet", async () => {
    const course = await seedCourse(1);
    const [opt] = await Promise.all(course.questionIds.map(withOptions));
    const userId = await seedUser();
    const { session, items } = await sessionWithItems(userId, course, "completed");
    const db = getDb();
    const clientEventId = crypto.randomUUID();
    // Altlast: so wurde der Fall früher gespeichert (Claim-Zeile mit Status conflict, nichts verbucht).
    await db.insert(syncEvents).values({ userId, clientEventId, type: "study_session", status: "conflict", clientCreatedAt: new Date(Date.now() - 2 * DAY), errorMessage: "Diese Session ist bereits abgeschlossen oder ausgesetzt." });
    const event = { clientEventId, type: "study_session" as const, clientCreatedAt: new Date(Date.now() - 2 * DAY).toISOString(), payload: { sessionId: session.id, answers: [{ itemId: items[0].id, selectedOptionId: opt.right }] } };
    const [first] = await processSyncEvents(userId, [event]);
    expect(first.status).toBe("applied_partial");
    expect(await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).toHaveLength(1);
    // Ein weiterer Versuch derselben Ereignis-ID verbucht nichts doppelt.
    const [second] = await processSyncEvents(userId, [event]);
    expect(second.status).toBe("applied_partial");
    expect(await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).toHaveLength(1);
  });

  it("Skript gibt Konflikt-Einträge frei (Trockenlauf ändert nichts, zweiter Lauf findet nichts)", async () => {
    const userId = await seedUser();
    const db = getDb();
    await db.insert(syncEvents).values({ userId, clientEventId: crypto.randomUUID(), type: "study_session", status: "conflict", clientCreatedAt: new Date(), errorMessage: "alt" });
    const dry = await releaseConflictEvents({ dryRun: true });
    expect(dry.conflicts).toBeGreaterThanOrEqual(1);
    expect(dry.released).toBe(0);
    expect((await db.select().from(syncEvents).where(and(eq(syncEvents.userId, userId), eq(syncEvents.status, "conflict")))).length).toBe(1);
    await releaseConflictEvents({ dryRun: false });
    expect((await db.select().from(syncEvents).where(and(eq(syncEvents.userId, userId), eq(syncEvents.status, "conflict")))).length).toBe(0);
    expect((await releaseConflictEvents({ dryRun: false })).conflicts).toBe(0);
  });

  it("verspäteter Lektionstest: Versuch und Wiederholungen werden verbucht, der Lernzielstand verschlechtert sich nie", async () => {
    const course = await seedCourse(3);
    const options = await Promise.all(course.questionIds.map(withOptions));
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    const userId = await seedUser();
    const db = getDb();
    // Online inzwischen sicher bestanden.
    await recordSectionQuizAttempt(userId, sectionId, course.questionIds.map((q, i) => ({ questionId: q, selectedOptionId: options[i].right })));
    const [before] = await db.select().from(objectiveProgress).where(and(eq(objectiveProgress.userId, userId), eq(objectiveProgress.objectiveId, course.objectiveId)));
    // Älterer Offline-Versuch, ganz falsch.
    const oldAt = new Date(Date.now() - 5 * DAY);
    const [result] = await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "section_quiz", clientCreatedAt: oldAt.toISOString(), payload: { sectionId, answers: course.questionIds.map((q, i) => ({ questionId: q, selectedOptionId: options[i].wrong, answeredAt: oldAt.toISOString() })) } },
    ]);
    expect(result.status).toBe("applied");
    expect((result.resultSummary as { late?: boolean }).late).toBe(true);
    const [after] = await db.select().from(objectiveProgress).where(eq(objectiveProgress.id, before.id));
    expect(Number(after.masteryScore)).toBeGreaterThanOrEqual(Number(before.masteryScore));
    expect((await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId))).length).toBe(2);
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(logs).toHaveLength(6);
    expect(logs.filter((l) => l.timestampUtc.getTime() === oldAt.getTime())).toHaveLength(3);
  });
});
