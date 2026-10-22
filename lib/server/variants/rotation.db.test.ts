/** Variantenrotation gegen echte DB: Auswahl, Auswertung am Original, Prüfliste. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { contentReports, itemStates, itemVariants, questionOptions, questions, reviewLog, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { buildReviewLogRow } from "@/lib/server/psrp/review-log";
import { completeStudySession, getStudySessionWithContent, revealStudySessionAnswer } from "@/lib/server/study/session-service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { flagOutlierVariants } from "./outliers";
import { chooseSessionVariants } from "./rotation";

const run = TEST_DB ? describe : describe.skip;

run("Variantenrotation (echte DB)", () => {
  let userId = "";
  let certId = "";
  let original = "";
  let variant = "";

  async function addOptions(questionId: string, label: string) {
    await getDb().insert(questionOptions).values([
      { questionId, orderNum: 1, text: { de: `${label} richtig`, en: `${label} right` } as never, isCorrect: true, rationale: null },
      { questionId, orderNum: 2, text: { de: `${label} falsch`, en: `${label} wrong` } as never, isCorrect: false, rationale: { de: "Weil nicht.", en: "Because not." } as never },
    ]);
  }

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    original = course.questionIds[0];
    await addOptions(original, "Original");
    const [v] = await getDb()
      .insert(questions)
      .values({ humanId: `V-${randomUUID().slice(0, 8)}`, objectiveId: course.objectiveId, difficulty: "easy", type: "single", question: { de: "Variante?", en: "Variant?" } as never, explanation: { de: "Variantenerklärung", en: "Variant explanation" } as never, probeOnly: true })
      .returning();
    variant = v.id;
    await addOptions(variant, "Variante");
    await getDb().insert(itemVariants).values({ itemId: original, questionId: variant, source: "generated" });
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  async function runRound(category: "review" | "new" = "review") {
    const chosen = await chooseSessionVariants(userId, [{ itemId: original, isNew: category === "new" }]);
    const [session] = await getDb().insert(studySessions).values({ userId, certificationId: certId, status: "planned", goalType: "questions", goalValue: 5 }).returning();
    const [item] = await getDb()
      .insert(studySessionItems)
      .values({ sessionId: session.id, orderNum: 1, category, referenceType: "question", referenceId: original, variantQuestionId: chosen.get(original) ?? null })
      .returning();
    const content = await getStudySessionWithContent(session.id, userId);
    const shown = content.items[0].question!;
    const correct = await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, shown.questionId), eq(questionOptions.isCorrect, true)));
    const result = await completeStudySession(session.id, userId, [{ itemId: item.id, selectedOptionId: correct[0].id, confidence: "sure" }]);
    return { sessionId: session.id, itemId: item.id, shownQuestionId: shown.questionId, result };
  }

  it("neue Fragen zeigen immer das Original", async () => {
    const chosen = await chooseSessionVariants(userId, [{ itemId: original, isNew: true }]);
    expect(chosen.size).toBe(0);
  });

  it("zeigt bei vier Wiederholungen nie zweimal hintereinander dieselbe Frage; Zustand und Log hängen am Original", async () => {
    const shown: string[] = [];
    for (let i = 0; i < 4; i++) {
      const round = await runRound();
      shown.push(round.shownQuestionId);
      expect(round.result.results[0]).toMatchObject({ questionId: original, isCorrect: true });
    }
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
    expect(new Set(shown)).toEqual(new Set([original, variant]));

    const states = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    expect(states.map((s) => s.itemId)).toEqual([original]);
    const log = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId)).orderBy(asc(reviewLog.timestampUtc));
    expect(log).toHaveLength(4);
    expect(log.every((r) => r.itemId === original)).toBe(true);
    expect(log.map((r) => r.variantQuestionId)).toEqual(shown.map((q) => (q === variant ? variant : null)));
  });

  it("Sofort-Feedback nutzt Erklärung und Optionen der gezeigten Variante", async () => {
    const [session] = await getDb().insert(studySessions).values({ userId, certificationId: certId, status: "planned", goalType: "questions", goalValue: 5 }).returning();
    const [item] = await getDb().insert(studySessionItems).values({ sessionId: session.id, orderNum: 1, category: "review", referenceType: "question", referenceId: original, variantQuestionId: variant }).returning();
    const [wrong] = await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, variant), eq(questionOptions.isCorrect, false)));
    const reveal = await revealStudySessionAnswer(session.id, userId, item.id, wrong.id);
    expect(reveal.isCorrect).toBe(false);
    expect(reveal.explanation.de).toBe("Variantenerklärung");
    expect(Object.keys(reveal.rationales)).toEqual([wrong.id]);
  });

  it("legt eine auffällige Variante in die Prüfliste, ohne Doppelmeldung", async () => {
    const { questionIds, objectiveId } = await seedCourse(1);
    const item = questionIds[0];
    const [v] = await getDb()
      .insert(questions)
      .values({ humanId: `V-${randomUUID().slice(0, 8)}`, objectiveId, difficulty: "easy", type: "single", question: { de: "V?", en: "V?" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true })
      .returning();
    const outlierUser = await seedUser();
    const rows = (id: string, variantId: string | null, rating: 1 | 3) =>
      Array.from({ length: 35 }, (_, i) => buildReviewLogRow({ userId: outlierUser, itemId: item, sessionId: randomUUID(), timestamp: new Date(Date.now() - (i + 1) * 60_000), timeZone: "UTC", rawRating: rating, variantQuestionId: variantId }));
    await getDb().insert(reviewLog).values([...rows(item, null, 3), ...rows(item, v.id, 1)]);
    expect(await flagOutlierVariants([item])).toBe(2);
    expect(await flagOutlierVariants([item])).toBe(0);
    const reports = await getDb().select().from(contentReports).where(eq(contentReports.reason, "variant_outlier"));
    expect(reports.map((r) => r.targetId)).toEqual(expect.arrayContaining([item, v.id]));
    await getDb().delete(users).where(eq(users.id, outlierUser));
  });
});
