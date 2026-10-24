/** Datenintegrität über Zeit, Phase 5: Grenzfälle gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemVariants, objectives, questionOptions, questions, quizAnswers, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
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

run("Grenzfälle (echte DB)", () => {
  it("Lektionstest: eine nach dem Download gelöschte Frage wird übersprungen, der Rest verbucht", async () => {
    const course = await seedCourse(2);
    const right = await Promise.all(course.questionIds.map(withOptions));
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    const userId = await seedUser();
    const db = getDb();
    await db.delete(questions).where(eq(questions.id, course.questionIds[1])); // in der Werkstatt gelöscht
    const [result] = await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "section_quiz", clientCreatedAt: new Date(Date.now() - DAY).toISOString(), payload: { sectionId, answers: course.questionIds.map((q, i) => ({ questionId: q, selectedOptionId: right[i] })) } },
    ]);
    expect(result.status).toBe("applied");
    expect((result.resultSummary as { skipped?: number }).skipped).toBe(1);
    expect(await db.select().from(quizAnswers)).toEqual(expect.arrayContaining([expect.objectContaining({ questionId: course.questionIds[0] })]));
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(logs.map((l) => l.itemId)).toEqual([course.questionIds[0]]);
  });

  it("Session: eine gelöschte Frage wird übersprungen, die übrigen Antworten werden verbucht", async () => {
    const course = await seedCourse(2);
    const right = await Promise.all(course.questionIds.map(withOptions));
    const userId = await seedUser();
    const db = getDb();
    const createdAt = new Date(Date.now() - 2 * DAY);
    const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: createdAt, createdAt }).returning();
    const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
    await db.delete(questions).where(eq(questions.id, course.questionIds[1]));
    const [result] = await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: new Date(Date.now() - DAY).toISOString(), payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: right[i] })) } },
    ]);
    expect(result.status).toBe("applied");
    expect((result.resultSummary as { skipped?: number }).skipped).toBe(1);
    expect((await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).map((l) => l.itemId)).toEqual([course.questionIds[0]]);
    expect((await db.select().from(studySessions).where(eq(studySessions.id, session.id)))[0].status).toBe("completed");
  });

  it("nicht zuordenbare Ereignisse werden als endgültig abgelehnt gemeldet (auch beim erneuten Senden)", async () => {
    const userId = await seedUser();
    const event = { clientEventId: crypto.randomUUID(), type: "section_quiz" as const, clientCreatedAt: new Date().toISOString(), payload: { sectionId: crypto.randomUUID(), answers: [] } };
    const [first] = await processSyncEvents(userId, [event]);
    const [second] = await processSyncEvents(userId, [event]);
    for (const r of [first, second]) expect(r).toMatchObject({ status: "error", terminal: true });
  });

  it("Antwort auf eine deaktivierte Variante wird dem Original-Item zugeordnet", async () => {
    const course = await seedCourse(1);
    const [original] = course.questionIds;
    const db = getDb();
    const [objective] = await db.select().from(objectives).where(eq(objectives.id, course.objectiveId));
    expect(objective).toBeTruthy();
    // Frage aus einem anderen Lernziel desselben Kurses als eingewebte Frage (Variante des Originals, inzwischen deaktiviert).
    const other = await seedCourseObjective(course);
    const variantRight = await withOptions(other.variantId);
    await db.insert(itemVariants).values({ itemId: other.itemId, questionId: other.variantId, source: "generated", active: false });
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    const quizRight = await withOptions(original);
    const userId = await seedUser();
    const [result] = await processSyncEvents(userId, [
      { clientEventId: crypto.randomUUID(), type: "section_quiz", clientCreatedAt: new Date(Date.now() - DAY).toISOString(), payload: { sectionId, answers: [{ questionId: original, selectedOptionId: quizRight }, { questionId: other.variantId, selectedOptionId: variantRight, woven: true }] } },
    ]);
    expect(result.status).toBe("applied");
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    const woven = logs.find((l) => l.reviewType === "interleaved");
    expect(woven?.itemId).toBe(other.itemId);
    expect(woven?.variantQuestionId).toBe(other.variantId);
  });
});

/** Zweites Lernziel im selben Kurs mit einer Frage (Item) und einer Variante dazu. */
async function seedCourseObjective(course: Awaited<ReturnType<typeof seedCourse>>) {
  const db = getDb();
  const [first] = await db.select().from(objectives).where(eq(objectives.id, course.objectiveId));
  const [objective] = await db.insert(objectives).values({ domainId: first.domainId, code: `O2-${course.tag}`, title: { de: "O2", en: "O2" } as never }).returning();
  const mk = async (suffix: string) => {
    const [q] = await db.insert(questions).values({ humanId: `Q2-${course.tag}-${suffix}`, objectiveId: objective.id, difficulty: "easy", type: "single", question: { de: "F", en: "Q" } as never, explanation: { de: "E", en: "E" } as never }).returning();
    return q.id;
  };
  return { itemId: await mk("item"), variantId: await mk("variant") };
}
