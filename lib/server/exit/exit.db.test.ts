/** Notausstieg „Heute reicht's“ gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { concepts, itemConcepts, conceptStruggles, itemStates, learningExits, quizAttempts, quizzes, reviewItems, sections, domains, objectives, questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { detectStruggles } from "@/lib/server/understanding/service";
import { exitSectionQuiz } from "./service";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { collectEngagementFacts } from "@/lib/server/engagement/service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { retrievability } from "@/lib/server/psrp/fsrs";
import { exitStudySession, getStudySessionWithContent, startStudySession } from "@/lib/server/study/session-service";

const run = TEST_DB ? describe : describe.skip;
import { questions } from "@/lib/server/db/schema";
import { randomUUID } from "node:crypto";
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
    ], items[1].itemId);

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

    // Signal für die Frühwarnung, mit der offenen Aufgabe
    expect((await collectEngagementFacts(userId, new Date())).exits).toBe(1);
    const [exitRow] = await getDb().select().from(learningExits).where(eq(learningExits.userId, userId));
    expect(exitRow.source).toBe("session");
    expect(exitRow.questionId).toBe(items[1].question!.questionId);
  });

  it("im Lektionstest: beantwortete Fragen zählen, die offene nicht; Ausstieg wird festgehalten", async () => {
    const course = await seedCourse(6);
    const db = getDb();
    for (const questionId of course.questionIds) {
      await db.insert(questionOptions).values([
        { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
        { questionId, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
      ]);
    }
    const [domain] = await db.select({ id: domains.id }).from(domains).where(eq(domains.certificationId, course.certId));
    const [objective] = await db.select({ id: objectives.id }).from(objectives).where(eq(objectives.domainId, domain.id));
    const [section] = await db.insert(sections).values({ objectiveId: objective.id, orderNum: 1, title: { de: "L", en: "L" } as never, content: { de: "T", en: "T" } as never } as never).returning();
    const userId = await seedUser();
    const [correct] = await db.select().from(questionOptions).where(and(eq(questionOptions.questionId, course.questionIds[0]), eq(questionOptions.isCorrect, true)));

    const result = await exitSectionQuiz(userId, section.id, course.questionIds[1], () =>
      recordSectionQuizAttempt(userId, section.id, [{ questionId: course.questionIds[0], selectedOptionId: correct.id, confidence: "sure" }]),
    );
    expect(result).not.toBeNull();
    expect((await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).map((l) => l.rawRating)).not.toContain(1);
    expect(await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId))).toHaveLength(1);
    const [exitRow] = await db.select().from(learningExits).where(eq(learningExits.userId, userId));
    expect([exitRow.source, exitRow.sectionId, exitRow.questionId]).toEqual(["section_quiz", section.id, course.questionIds[1]]);
    expect(await exitSectionQuiz(userId, randomUUID(), null, async () => {})).toBeNull();
    void quizzes;
  });

  it("mehrfacher Ausstieg beim selben Konzept zählt als Signal für den Verstehens-Modus (nur zusammen mit einem weiteren)", async () => {
    const course = await seedCourse(2);
    const db = getDb();
    const userId = await seedUser();
    const [concept] = await db.insert(concepts).values({ courseId: course.certId, topicArea: "T", name: `K ${randomUUID().slice(0, 6)}` }).returning();
    for (const itemId of course.questionIds) await db.insert(itemConcepts).values({ itemId, conceptId: concept.id });
    // zwei Ausstiege bei verschiedenen Aufgaben desselben Konzepts: allein noch kein Muster
    await db.insert(learningExits).values([
      { userId, source: "session", questionId: course.questionIds[0] },
      { userId, source: "session", questionId: course.questionIds[1] },
    ]);
    expect(await detectStruggles(userId, [course.questionIds[0]])).toEqual([]);
    // dazu „falsch + sicher“: zwei Signalarten. Drei Versuche, damit die Fehlerart als Fehlvorstellung gilt (Aufgabe 15).
    const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 5, completedAt: new Date() }).returning();
    await db.insert(studySessionItems).values([1, 2, 3].map((orderNum) => ({ sessionId: session.id, orderNum, category: "review" as const, referenceType: "question" as const, referenceId: course.questionIds[0], outcome: "incorrect" as const, confidence: "sure" as const })));
    expect(await detectStruggles(userId, [course.questionIds[0]])).toEqual([concept.id]);
    const [struggle] = await db.select().from(conceptStruggles).where(eq(conceptStruggles.userId, userId));
    expect(struggle.signals.map((x) => x.kind)).toEqual(expect.arrayContaining(["repeated_exit", "sure_wrong"]));
    void questions;
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
