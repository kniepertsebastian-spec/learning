/** Notausstieg „Heute reicht's“ gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, reviewItems, questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { collectEngagementFacts } from "@/lib/server/engagement/service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { retrievability } from "@/lib/server/psrp/fsrs";
import { exitStudySession, getStudySessionWithContent, startStudySession } from "@/lib/server/study/session-service";

const run = TEST_DB ? describe : describe.skip;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

run("Notausstieg (echte DB)", () => {
  it("beendet mit den bisherigen Antworten, wertet Unbeantwortetes nicht, bietet höchstens drei sichere Aufgaben an und zählt als Signal", async () => {
    const course = await seedCourse(10);
    for (const questionId of course.questionIds) {
      await getDb().insert(questionOptions).values([
        { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
        { questionId, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
      ]);
    }
    const userId = await seedUser();
    // vier sichere, bald fällige Karten (Erfolgsaufgaben-Kandidaten); der Rest ist neu
    const known = course.questionIds.slice(0, 4);
    await getDb().insert(itemStates).values(
      known.map((itemId) => ({ userId, itemId, stability: 40, difficulty: 4, reps: 5, lapses: 0, fsrsState: 2, lastReview: daysAgo(2), due: new Date(Date.now() + 86_400_000) })),
    );

    await getDb().insert(reviewItems).values(known.map((questionId) => ({ userId, questionId, dueAt: new Date(Date.now() + 86_400_000) })));

    const session = await startStudySession(userId, course.certId, 10);
    const { items } = await getStudySessionWithContent(session.id, userId);
    expect(items.length).toBeGreaterThan(1);
    const first = items[0];
    const [correct] = await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, first.question!.questionId), eq(questionOptions.isCorrect, true)));

    const result = await exitStudySession(session.id, userId, [
      { itemId: first.itemId, selectedOptionId: correct.id, confidence: "sure" },
      { itemId: items[1].itemId, selectedOptionId: "", confidence: undefined },
    ]);

    // nur die beantwortete Aufgabe zählt, die abgebrochene hat kein Rating bekommen
    expect(result.results).toHaveLength(1);
    const logs = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(logs.filter((l) => l.rawRating === 1)).toHaveLength(0);
    const [done] = await getDb().select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(done.status).toBe("completed");
    expect(done.exitedAt).not.toBeNull();
    const [skipped] = await getDb().select().from(studySessionItems).where(eq(studySessionItems.id, items[1].itemId));
    expect(skipped.outcome).toBeNull();

    // Erfolgsaufgaben: höchstens drei, sehr wahrscheinlich gekonnt, nicht aus der abgebrochenen Session
    expect(result.winSession).toBe(true);
    const sessionRefs = new Set(items.map((i) => i.question!.questionId));
    const [win] = await getDb().select().from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "planned")));
    const winItems = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, win.id));
    expect(winItems.length).toBeGreaterThan(0);
    expect(winItems.length).toBeLessThanOrEqual(3);
    for (const w of winItems) {
      expect(w.category).toBe("win");
      expect(sessionRefs.has(w.referenceId)).toBe(false);
      const [state] = await getDb().select().from(itemStates).where(and(eq(itemStates.userId, userId), eq(itemStates.itemId, w.referenceId)));
      expect(retrievability(state, new Date())!).toBeGreaterThanOrEqual(0.9);
    }

    // Signal für die Frühwarnung
    expect((await collectEngagementFacts(userId, new Date())).exits).toBe(1);
  });

  it("ohne passende Karten gibt es keine Folge-Session", async () => {
    const course = await seedCourse(3);
    const userId = await seedUser();
    const session = await startStudySession(userId, course.certId, 10);
    const result = await exitStudySession(session.id, userId, []);
    expect(result.winSession).toBe(false);
    expect(await getDb().select().from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "planned")))).toHaveLength(0);
  });
});
