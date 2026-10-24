/** Schwächen einweben gegen echte DB (Akzeptanzkriterium Phase 10). Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { conceptPrerequisites, conceptStruggles, concepts, domains, itemConcepts, itemStates, itemVariants, lessons, objectiveProgress, objectives, questionOptions, questions, quizAnswers, quizAttempts, reviewLog } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordSectionQuizAttempt, recordSimulationWovenAnswer } from "@/lib/server/sections/attempt-service";
import { recordSimulationSolved } from "@/lib/server/simulations/service";
import { pickWovenQuestions } from "./candidates";

const run = TEST_DB ? describe : describe.skip;
const now = new Date("2026-10-23T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

async function withOptions(questionId: string) {
  const [right, wrong] = await getDb()
    .insert(questionOptions)
    .values([
      { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
      { questionId, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
    ])
    .returning();
  return { right: right.id, wrong: wrong.id };
}

async function fixture() {
  const course = await seedCourse(2); // Lernziel A (aktuelle Lektion) mit zwei Fragen
  const db = getDb();
  const userId = await seedUser();
  const [sectionA] = await seedLessons(course.objectiveId, ["Lektion A"]);
  const [domain] = await db.select().from(domains).where(eq(domains.certificationId, course.certId));
  const [objB] = await db.insert(objectives).values({ domainId: domain.id, code: `B-${course.tag}`, title: { de: "B", en: "B" } as never }).returning();
  const [qB] = await db.insert(questions).values({ humanId: `QB-${course.tag}`, objectiveId: objB.id, difficulty: "easy", type: "single", question: { de: "FB", en: "QB" } as never, explanation: { de: "E", en: "E" } as never }).returning();
  const optB = await withOptions(qB.id);
  const optA = await Promise.all(course.questionIds.map(withOptions));
  const [concept] = await db.insert(concepts).values({ courseId: course.certId, topicArea: "Netz", name: `K-${randomUUID().slice(0, 6)}` }).returning();
  await db.insert(itemConcepts).values([{ itemId: course.questionIds[0], conceptId: concept.id }, { itemId: qB.id, conceptId: concept.id }]);
  // B wurde schon gelernt und ist fällig
  await db.insert(itemStates).values({ userId, itemId: qB.id, stability: 2, difficulty: 5, reps: 2, lapses: 0, fsrsState: 2, lastReview: day(-10), due: day(-1) });
  return { ...course, userId, sectionA, objB, qB: qB.id, optB, optA, concept };
}

run("Einweben (echte DB)", () => {
  afterEach(() => {
    delete process.env.FEATURE_WOVEN_REVIEWS;
  });

  it("wählt die fällige Frage mit gemeinsamem Konzept aus einem anderen Lernziel", async () => {
    const fx = await fixture();
    const picked = await pickWovenQuestions(fx.userId, fx.sectionA, 2, now);
    expect(picked).toHaveLength(1); // 20 % von 2, aber mindestens eine
    expect(picked[0]).toMatchObject({ id: fx.qB, itemId: fx.qB, woven: true });
    expect(picked[0].options.some((o) => o.isCorrect)).toBe(true);
  });

  it("nichts bei ausgeschaltetem Flag, ohne Fälligkeit, ohne Konzeptbezug oder im Verstehens-Modus", async () => {
    const fx = await fixture();
    process.env.FEATURE_WOVEN_REVIEWS = "0";
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(0);
    delete process.env.FEATURE_WOVEN_REVIEWS;

    // noch nicht fällig und gut behalten
    await getDb().update(itemStates).set({ due: day(30), stability: 300, lastReview: day(-1) }).where(eq(itemStates.itemId, fx.qB));
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(0);
    await getDb().update(itemStates).set({ due: day(-1), stability: 2, lastReview: day(-10) }).where(eq(itemStates.itemId, fx.qB));
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(1);

    // Konzept im Verstehens-Modus
    await getDb().insert(conceptStruggles).values({ userId: fx.userId, conceptId: fx.concept.id, status: "in_progress" });
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(0);

    // anderer Kurs / ohne Konzept
    const other = await fixture();
    await getDb().delete(itemConcepts).where(eq(itemConcepts.itemId, other.qB));
    expect(await pickWovenQuestions(other.userId, other.sectionA, 2, now)).toHaveLength(0);
  });

  it("freigegebene Voraussetzung zählt als Bezug, ein Entwurf nicht", async () => {
    const fx = await fixture();
    const [prereq] = await getDb().insert(concepts).values({ courseId: fx.certId, topicArea: "Anderes", name: `V-${randomUUID().slice(0, 6)}` }).returning();
    await getDb().delete(itemConcepts).where(eq(itemConcepts.itemId, fx.qB));
    await getDb().insert(itemConcepts).values({ itemId: fx.qB, conceptId: prereq.id });
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(0);
    const [row] = await getDb().insert(conceptPrerequisites).values({ conceptId: fx.concept.id, requiresConceptId: prereq.id, status: "draft" }).returning();
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(0);
    await getDb().update(conceptPrerequisites).set({ status: "approved" }).where(eq(conceptPrerequisites.id, row.id));
    expect(await pickWovenQuestions(fx.userId, fx.sectionA, 2, now)).toHaveLength(1);
  });

  it("Ergebnis: Eingewebtes zählt nicht fürs Bestehen, aktualisiert aber den FSRS-Zustand (interleaved, mit Lektion)", async () => {
    const fx = await fixture();
    const before = (await getDb().select().from(itemStates).where(and(eq(itemStates.userId, fx.userId), eq(itemStates.itemId, fx.qB))))[0];
    const result = await recordSectionQuizAttempt(fx.userId, fx.sectionA, [
      { questionId: fx.questionIds[0], selectedOptionId: fx.optA[0].right },
      { questionId: fx.questionIds[1], selectedOptionId: fx.optA[1].right },
      { questionId: fx.qB, selectedOptionId: fx.optB.wrong, woven: true }, // falsch eingewoben
    ]);
    expect(result.score).toBe(100); // die falsche eingewobene Antwort ändert das Ergebnis nicht
    expect(result.results).toHaveLength(2);
    const answers = await getDb().select().from(quizAnswers).where(eq(quizAnswers.quizAttemptId, result.attemptId));
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.questionId)).not.toContain(fx.qB);

    const [lesson] = await getDb().select().from(lessons).where(eq(lessons.sectionId, fx.sectionA));
    const log = await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, fx.userId), eq(reviewLog.itemId, fx.qB)));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ reviewType: "interleaved", rawRating: 1, wovenIntoLessonId: lesson.id });
    const after = (await getDb().select().from(itemStates).where(and(eq(itemStates.userId, fx.userId), eq(itemStates.itemId, fx.qB))))[0];
    expect(after.lapses).toBe(before.lapses + 1); // falsch → Zustand des Gedächtnismodells ändert sich
    // Lernziel B (andere Lektion) bekommt keinen Fortschritt aus dem Einweben
    expect(await getDb().select().from(objectiveProgress).where(and(eq(objectiveProgress.userId, fx.userId), eq(objectiveProgress.objectiveId, fx.objB.id)))).toHaveLength(0);
  });

  it("Variante: Review hängt am Original, die gezeigte Variante steht im Log; fremde Fragen werden ignoriert", async () => {
    const fx = await fixture();
    const [variant] = await getDb().insert(questions).values({ humanId: `QB-V-${fx.tag}`, objectiveId: fx.objB.id, difficulty: "easy", type: "single", question: { de: "V", en: "V" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true }).returning();
    const optV = await withOptions(variant.id);
    await getDb().insert(itemVariants).values({ itemId: fx.qB, questionId: variant.id, source: "generated" }) // die Zeile des Originals legt die Datenbank selbst an;
    const foreign = await seedCourse(1);
    const optF = await withOptions(foreign.questionIds[0]);

    await recordSectionQuizAttempt(fx.userId, fx.sectionA, [
      { questionId: fx.questionIds[0], selectedOptionId: fx.optA[0].right },
      { questionId: variant.id, selectedOptionId: optV.right, woven: true },
      { questionId: foreign.questionIds[0], selectedOptionId: optF.right, woven: true },
      { questionId: fx.questionIds[1], selectedOptionId: fx.optA[1].wrong, woven: true }, // eigene Lektion: kein gültiges Einweben
    ]);
    const log = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, fx.userId));
    const woven = log.filter((l) => l.reviewType === "interleaved");
    expect(woven).toHaveLength(1);
    expect(woven[0]).toMatchObject({ itemId: fx.qB, variantQuestionId: variant.id, rawRating: 3 });
    // Versuch zählt nur die reguläre Frage
    const [attempt] = await getDb().select().from(quizAttempts).where(eq(quizAttempts.userId, fx.userId));
    expect(Number(attempt.score)).toBe(100);
  });

  it("ohne Flag werden eingewebte Antworten verworfen", async () => {
    const fx = await fixture();
    process.env.FEATURE_WOVEN_REVIEWS = "0";
    await recordSectionQuizAttempt(fx.userId, fx.sectionA, [
      { questionId: fx.questionIds[0], selectedOptionId: fx.optA[0].right },
      { questionId: fx.qB, selectedOptionId: fx.optB.right, woven: true },
    ]);
    expect(await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, fx.userId), eq(reviewLog.itemId, fx.qB)))).toHaveLength(0);
  });

  describe("in Simulationen", () => {
    const SIM = "```simulation\n" + JSON.stringify({ type: "terminal", title: "T", scenario: "S", steps: [{ goal: "g", accept: ["ls"], output: "", hint: "h" }], success: "ok" }) + "\n```";

    async function withSimulation() {
      const fx = await fixture();
      await getDb().update(lessons).set({ content: { de: SIM, en: SIM } as never }).where(eq(lessons.sectionId, fx.sectionA));
      return fx;
    }

    it("max legt die Zahl fest, unabhängig von der Testlänge", async () => {
      const fx = await fixture();
      expect(await pickWovenQuestions(fx.userId, fx.sectionA, 0, now, { max: 1 })).toHaveLength(1);
      expect(await pickWovenQuestions(fx.userId, fx.sectionA, 0, now)).toHaveLength(0);
      process.env.FEATURE_WOVEN_REVIEWS = "0";
      expect(await pickWovenQuestions(fx.userId, fx.sectionA, 0, now, { max: 1 })).toHaveLength(0);
    });

    it("souverän gelöste Simulation liefert eine Frage von früher, mühsam gelöste nicht", async () => {
      const fx = await withSimulation();
      const clean = await recordSimulationSolved(fx.userId, fx.sectionA, 0, 0);
      expect(clean.woven.map((w) => w.itemId)).toEqual([fx.qB]);
      const struggled = await recordSimulationSolved(fx.userId, fx.sectionA, 0, 5);
      expect(struggled.woven).toHaveLength(0);
    });

    it("die Antwort wird als Review gebucht (interleaved, mit Lektion), ohne Fortschritt im Lernziel", async () => {
      const fx = await withSimulation();
      expect(await recordSimulationWovenAnswer(fx.userId, fx.sectionA, { questionId: fx.qB, selectedOptionId: fx.optB.wrong })).toBe(true);
      const [lesson] = await getDb().select().from(lessons).where(eq(lessons.sectionId, fx.sectionA));
      const log = await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, fx.userId), eq(reviewLog.itemId, fx.qB)));
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ reviewType: "interleaved", rawRating: 1, wovenIntoLessonId: lesson.id });
      expect(await getDb().select().from(objectiveProgress).where(and(eq(objectiveProgress.userId, fx.userId), eq(objectiveProgress.objectiveId, fx.objB.id)))).toHaveLength(0);
      // eigene Lektion ist kein gültiges Einweben
      await recordSimulationWovenAnswer(fx.userId, fx.sectionA, { questionId: fx.questionIds[0], selectedOptionId: fx.optA[0].right });
      expect(await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, fx.userId), eq(reviewLog.itemId, fx.questionIds[0])))).toHaveLength(0);
    });

    it("ohne Flag wird nichts gebucht", async () => {
      const fx = await withSimulation();
      process.env.FEATURE_WOVEN_REVIEWS = "0";
      expect(await recordSimulationWovenAnswer(fx.userId, fx.sectionA, { questionId: fx.qB, selectedOptionId: fx.optB.right })).toBe(false);
      expect(await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, fx.userId), eq(reviewLog.itemId, fx.qB)))).toHaveLength(0);
    });
  });
});
