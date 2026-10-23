/** Rückblick „Was weißt du noch?“ gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemVariants, lessonCompletions, questionOptions, questions, recallChecks, reviewLog, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { completeStudySession, getStudySessionWithContent, startStudySession } from "@/lib/server/study/session-service";
import { skipRecallCheck } from "./service";

const run = TEST_DB ? describe : describe.skip;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function addOptions(questionId: string) {
  await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
    { questionId, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
  ]);
}

/** Kurs mit Lektion, `questionCount` Fragen (je mit einer Variante) und einem Abschluss der Lektion vor `completedHoursAgo` Stunden. */
async function seedRecallCourse(userId: string, completedHoursAgo: number | null, questionCount = 4) {
  const course = await seedCourse(questionCount);
  const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
  const variantIds: string[] = [];
  for (const itemId of course.questionIds) {
    await addOptions(itemId);
    const [variant] = await getDb()
      .insert(questions)
      .values({ humanId: `RV-${randomUUID().slice(0, 8)}`, objectiveId: course.objectiveId, difficulty: "easy", type: "single", question: { de: "Variante?", en: "Variant?" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true })
      .returning();
    await addOptions(variant.id);
    await getDb().insert(itemVariants).values({ itemId, questionId: variant.id, source: "generated" });
    variantIds.push(variant.id);
  }
  if (completedHoursAgo !== null) await getDb().insert(lessonCompletions).values({ userId, sectionId, completedAt: hoursAgo(completedHoursAgo) });
  return { ...course, sectionId, variantIds };
}

async function answerAll(sessionId: string, userId: string) {
  const { items } = await getStudySessionWithContent(sessionId, userId);
  const answers = [];
  for (const item of items) {
    if (!item.question) continue;
    const [correct] = await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, item.question.questionId), eq(questionOptions.isCorrect, true)));
    answers.push({ itemId: item.itemId, selectedOptionId: correct.id, confidence: "sure" as const });
  }
  return completeStudySession(sessionId, userId, answers);
}

run("Rückblick (echte DB)", () => {
  const userIds: string[] = [];
  const newUser = async () => {
    const id = await seedUser();
    userIds.push(id);
    return id;
  };
  beforeAll(() => {
    delete process.env.FEATURE_RECALL_CHECK;
  });
  afterAll(async () => {
    for (const id of userIds) await getDb().delete(users).where(eq(users.id, id));
  });

  it("bietet nach ≥ 1 Tag einen Rückblick mit höchstens drei Varianten am Session-Anfang an", async () => {
    const userId = await newUser();
    const course = await seedRecallCourse(userId, 48);
    const session = await startStudySession(userId, course.certId, 10);
    const { items } = await getStudySessionWithContent(session.id, userId);

    const recall = items.filter((i) => i.category === "recall");
    expect(recall).toHaveLength(3);
    expect(items.slice(0, 3).map((i) => i.category)).toEqual(["recall", "recall", "recall"]);
    // Gezeigt wird immer eine Variante (nie die Frage aus dem Lektionstest)
    for (const item of recall) expect(course.variantIds).toContain(item.question!.questionId);
    expect(recall[0].recall).toMatchObject({ sectionId: course.sectionId });
    // Ein Item erscheint höchstens einmal je Session
    const itemRows = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, session.id)).orderBy(asc(studySessionItems.orderNum));
    const refs = itemRows.filter((r) => r.referenceType === "question").map((r) => r.referenceId);
    expect(new Set(refs).size).toBe(refs.length);

    const [check] = await getDb().select().from(recallChecks).where(eq(recallChecks.sessionId, session.id));
    expect(check).toMatchObject({ status: "offered", questionCount: 3, sectionId: course.sectionId });
    expect(check.hoursSinceLesson).toBeGreaterThan(47.9);
    expect(check.hoursSinceLesson).toBeLessThan(48.1);
    expect(check.hourAtRecall).toBeGreaterThanOrEqual(0);
    expect(check.hourAtLearning).toBeGreaterThanOrEqual(0);
  });

  it("loggt den Rückblick als recall_check am Original-Item mit gezeigter Variante und hält das Ergebnis fest", async () => {
    const userId = await newUser();
    const course = await seedRecallCourse(userId, 30);
    const session = await startStudySession(userId, course.certId, 10);
    const result = await answerAll(session.id, userId);
    expect(result.results.every((r) => r.isCorrect)).toBe(true);

    const log = await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, userId), eq(reviewLog.reviewType, "recall_check")));
    expect(log).toHaveLength(3);
    for (const row of log) {
      expect(course.questionIds).toContain(row.itemId); // verbucht am Original
      expect(course.variantIds).toContain(row.variantQuestionId); // gezeigte Variante
      expect(row.rawRating).toBe(4); // richtig + sicher, wie bei jedem Review
    }
    const [check] = await getDb().select().from(recallChecks).where(eq(recallChecks.sessionId, session.id));
    expect(check).toMatchObject({ status: "answered", correctCount: 3 });
  });

  it("fragt eine Lektion nur einmal ab und nimmt keine zu junge oder zu alte", async () => {
    const userId = await newUser();
    const course = await seedRecallCourse(userId, 48);
    const first = await startStudySession(userId, course.certId, 10);
    await answerAll(first.id, userId);
    const second = await startStudySession(userId, course.certId, 10);
    expect((await getStudySessionWithContent(second.id, userId)).items.some((i) => i.category === "recall")).toBe(false);

    for (const hours of [5, 15 * 24]) {
      const other = await newUser();
      const c = await seedRecallCourse(other, hours);
      const s = await startStudySession(other, c.certId, 10);
      expect((await getStudySessionWithContent(s.id, other)).items.some((i) => i.category === "recall")).toBe(false);
    }
  });

  it("kein Rückblick ohne abgeschlossene Lektion oder ohne Varianten", async () => {
    const userId = await newUser();
    const noLesson = await seedRecallCourse(userId, null);
    const s1 = await startStudySession(userId, noLesson.certId, 10);
    expect((await getStudySessionWithContent(s1.id, userId)).items.some((i) => i.category === "recall")).toBe(false);

    const other = await newUser();
    const plain = await seedCourse(3);
    const [sectionId] = await seedLessons(plain.objectiveId, ["Text"]);
    for (const q of plain.questionIds) await addOptions(q);
    await getDb().insert(lessonCompletions).values({ userId: other, sectionId, completedAt: hoursAgo(48) });
    const s2 = await startStudySession(other, plain.certId, 10);
    expect((await getStudySessionWithContent(s2.id, other)).items.some((i) => i.category === "recall")).toBe(false);
  });

  it("Überspringen entfernt die Rückblick-Fragen und hält es als übersprungen fest", async () => {
    const userId = await newUser();
    const course = await seedRecallCourse(userId, 48);
    const session = await startStudySession(userId, course.certId, 10);
    expect(await skipRecallCheck(session.id, userId)).toBe(3);
    const { items } = await getStudySessionWithContent(session.id, userId);
    expect(items.some((i) => i.category === "recall")).toBe(false);
    const [check] = await getDb().select().from(recallChecks).where(eq(recallChecks.sessionId, session.id));
    expect(check.status).toBe("skipped");
    // übersprungen zählt als abgefragt: kommt nicht noch einmal
    await getDb().update(studySessions).set({ status: "skipped" }).where(eq(studySessions.id, session.id));
    const next = await startStudySession(userId, course.certId, 10);
    expect((await getStudySessionWithContent(next.id, userId)).items.some((i) => i.category === "recall")).toBe(false);
  });

  it("ist mit FEATURE_RECALL_CHECK=0 abschaltbar", async () => {
    process.env.FEATURE_RECALL_CHECK = "0";
    try {
      const userId = await newUser();
      const course = await seedRecallCourse(userId, 48);
      const session = await startStudySession(userId, course.certId, 10);
      expect((await getStudySessionWithContent(session.id, userId)).items.some((i) => i.category === "recall")).toBe(false);
    } finally {
      delete process.env.FEATURE_RECALL_CHECK;
    }
  });
});
