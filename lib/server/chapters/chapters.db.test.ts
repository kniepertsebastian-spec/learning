/** Kapitel-Quiz und Kapitelabschluss gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessonCompletions, objectives, questionOptions, quizAttempts, quizzes } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordChapterQuizAttempt } from "@/lib/server/sections/attempt-service";
import { drawChapterQuiz, getChapterOverview } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function courseWithOptions(questionCount: number) {
  const course = await seedCourse(questionCount);
  const db = getDb();
  const optionIds = new Map<string, { right: string; wrong: string }>();
  for (const questionId of course.questionIds) {
    const [right] = await db.insert(questionOptions).values({ questionId, text: { de: "richtig", en: "right" }, isCorrect: true, orderNum: 1 }).returning({ id: questionOptions.id });
    const [wrong] = await db.insert(questionOptions).values({ questionId, text: { de: "falsch", en: "wrong" }, isCorrect: false, orderNum: 2 }).returning({ id: questionOptions.id });
    optionIds.set(questionId, { right: right.id, wrong: wrong.id });
  }
  const [objective] = await db.select({ domainId: objectives.domainId }).from(objectives).where(eq(objectives.id, course.objectiveId)).limit(1);
  return { ...course, domainId: objective.domainId, optionIds };
}

run("Kapitel-Quiz (echte DB)", () => {
  it("zieht 10 verschiedene Fragen aus dem Pool und meidet beim zweiten Aufruf die zuletzt gestellten", async () => {
    const course = await courseWithOptions(12);
    const userId = await seedUser();
    const first = await drawChapterQuiz(userId, course.domainId);
    expect(first?.poolSize).toBe(12);
    expect(first?.questions).toHaveLength(10);
    expect(new Set(first!.questions.map((q) => q.id)).size).toBe(10);
    expect(first!.questions[0].options).toHaveLength(2);

    await recordChapterQuizAttempt(userId, course.domainId, first!.questions.map((q) => ({ questionId: q.id, selectedOptionId: course.optionIds.get(q.id)!.right })));
    const shown = new Set(first!.questions.map((q) => q.id));
    const notShown = course.questionIds.filter((id) => !shown.has(id));
    expect(notShown).toHaveLength(2);
    const second = await drawChapterQuiz(userId, course.domainId);
    // Die zwei noch nie gestellten Fragen sind auf jeden Fall dabei.
    for (const id of notShown) expect(second!.questions.map((q) => q.id)).toContain(id);
  });

  it("verbucht den Versuch am Kapitel; Kapitel gilt erst mit allen Lektionen und bestandenem Quiz als abgeschlossen", async () => {
    const course = await courseWithOptions(10);
    const [sectionA, sectionB] = await seedLessons(course.objectiveId, ["Eins", "Zwei"]);
    const userId = await seedUser();
    const db = getDb();

    let [chapter] = await getChapterOverview(userId, course.certId);
    expect(chapter).toMatchObject({ sectionTotal: 2, sectionsDone: 0, poolSize: 10, bestScore: null, completed: false });

    // Quiz mit 40 % richtig: nicht bestanden
    const draw = await drawChapterQuiz(userId, course.domainId);
    const answers = draw!.questions.map((q, i) => ({ questionId: q.id, selectedOptionId: i < 4 ? course.optionIds.get(q.id)!.right : course.optionIds.get(q.id)!.wrong }));
    const low = await recordChapterQuizAttempt(userId, course.domainId, answers);
    expect(low.score).toBe(40);
    [chapter] = await getChapterOverview(userId, course.certId);
    expect(chapter).toMatchObject({ bestScore: 40, quizPassed: false, completed: false });

    // Genau ein Quiz je Kapitel, beide Versuche hängen daran
    const quizRows = await db.select().from(quizzes).where(eq(quizzes.domainId, course.domainId));
    expect(quizRows).toHaveLength(1);
    expect(quizRows[0].sectionId).toBeNull();

    // Zweiter Versuch: 100 % → bestanden, aber Lektionen fehlen noch
    const high = await recordChapterQuizAttempt(userId, course.domainId, draw!.questions.map((q) => ({ questionId: q.id, selectedOptionId: course.optionIds.get(q.id)!.right })));
    expect(high.score).toBe(100);
    expect(await db.select().from(quizAttempts).where(eq(quizAttempts.quizId, quizRows[0].id))).toHaveLength(2);
    [chapter] = await getChapterOverview(userId, course.certId);
    expect(chapter).toMatchObject({ bestScore: 100, quizPassed: true, lessonsDone: false, completed: false });

    await db.insert(lessonCompletions).values({ userId, sectionId: sectionA });
    await db.insert(lessonCompletions).values({ userId, sectionId: sectionB });
    [chapter] = await getChapterOverview(userId, course.certId);
    expect(chapter).toMatchObject({ sectionsDone: 2, lessonsDone: true, completed: true });
  });

  it("veraltete Fragen und Probe-Fragen gehören nicht in den Pool", async () => {
    const course = await courseWithOptions(4);
    const { questions } = await import("@/lib/server/db/schema");
    await getDb().update(questions).set({ stale: true }).where(eq(questions.id, course.questionIds[0]));
    await getDb().update(questions).set({ probeOnly: true }).where(eq(questions.id, course.questionIds[1]));
    const draw = await drawChapterQuiz(await seedUser(), course.domainId);
    expect(draw?.poolSize).toBe(2);
    expect(draw!.questions.map((q) => q.id).sort()).toEqual(course.questionIds.slice(2).sort());
  });
});
