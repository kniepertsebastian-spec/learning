/** Einstufungstest gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessonCompletions, questionOptions, questions } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { getPreAssessmentRecord, loadPreAssessment, shouldOfferPreAssessment, skipPreAssessment, submitPreAssessment } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function course(questionCount: number) {
  const c = await seedCourse(questionCount);
  const options = new Map<string, { right: string; wrong: string }>();
  for (const questionId of c.questionIds) {
    const db = getDb();
    const [right] = await db.insert(questionOptions).values({ questionId, text: { de: "r", en: "r" }, isCorrect: true, orderNum: 1 }).returning({ id: questionOptions.id });
    const [wrong] = await db.insert(questionOptions).values({ questionId, text: { de: "f", en: "w" }, isCorrect: false, orderNum: 2 }).returning({ id: questionOptions.id });
    options.set(questionId, { right: right.id, wrong: wrong.id });
  }
  return { ...c, options };
}

run("Einstufungstest (echte DB)", () => {
  it("stellt höchstens 10 Auswahlfragen ohne Lösung zusammen, wertet aus und speichert einmalig", async () => {
    const c = await course(14);
    const userId = await seedUser();
    expect(await shouldOfferPreAssessment(userId, c.certId)).toBe(true);

    const test = await loadPreAssessment(c.certId);
    expect(test.questions).toHaveLength(10);
    expect(JSON.stringify(test.questions)).not.toContain("isCorrect");

    const answers = test.questions.map((q, i) => ({ questionId: q.questionId, selectedOptionId: i < 6 ? c.options.get(q.questionId)!.right : c.options.get(q.questionId)!.wrong }));
    const result = await submitPreAssessment(userId, c.certId, answers);
    expect(result).toMatchObject({ correct: 6, total: 10 });
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0]).toMatchObject({ correct: 6, total: 10 });

    const record = await getPreAssessmentRecord(userId, c.certId);
    expect(record).toMatchObject({ status: "completed", correctCount: 6, totalCount: 10 });
    expect(await shouldOfferPreAssessment(userId, c.certId)).toBe(false);
    // Ein zweiter Versuch ist nicht möglich
    await expect(submitPreAssessment(userId, c.certId, answers)).rejects.toThrow();
  });

  it("lehnt fremde Fragen, Doppelte und zu viele Antworten ab", async () => {
    const c = await course(3);
    const other = await course(3);
    const userId = await seedUser();
    const [q] = c.questionIds;
    await expect(submitPreAssessment(userId, c.certId, [{ questionId: other.questionIds[0], selectedOptionId: other.options.get(other.questionIds[0])!.right }])).rejects.toThrow();
    await expect(submitPreAssessment(userId, c.certId, [{ questionId: q, selectedOptionId: c.options.get(q)!.right }, { questionId: q, selectedOptionId: c.options.get(q)!.wrong }])).rejects.toThrow();
    expect(await getPreAssessmentRecord(userId, c.certId)).toBeNull();
  });

  it("Überspringen wird gemerkt; wer schon gelernt hat, bekommt ihn nicht angeboten", async () => {
    const c = await course(4);
    const skipper = await seedUser();
    await skipPreAssessment(skipper, c.certId);
    expect(await shouldOfferPreAssessment(skipper, c.certId)).toBe(false);
    expect(await getPreAssessmentRecord(skipper, c.certId)).toMatchObject({ status: "skipped", correctCount: null });

    const learner = await seedUser();
    const [section] = await seedLessons(c.objectiveId, ["Text"]);
    expect(await shouldOfferPreAssessment(learner, c.certId)).toBe(true);
    await getDb().insert(lessonCompletions).values({ userId: learner, sectionId: section });
    expect(await shouldOfferPreAssessment(learner, c.certId)).toBe(false);
  });

  it("nur Auswahlfragen und aktuelle Fragen zählen; ohne solche Fragen gibt es keinen Test", async () => {
    const c = await course(2);
    await getDb().update(questions).set({ answerFormat: "short_answer" }).where(eq(questions.id, c.questionIds[0]));
    await getDb().update(questions).set({ stale: true }).where(eq(questions.id, c.questionIds[1]));
    const userId = await seedUser();
    expect(await shouldOfferPreAssessment(userId, c.certId)).toBe(false);
    expect((await loadPreAssessment(c.certId)).questions).toHaveLength(0);
  });
});
