/** Verstehens-Modus gegen echte DB (Akzeptanzkriterium Phase 9). Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { conceptStruggles, concepts, itemConcepts, itemStates, itemVariants, questionOptions, questions, reviewLog, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { completeStudySession, getStudySessionWithContent, startStudySession } from "@/lib/server/study/session-service";
import type { AnswerConfidence } from "@/lib/types";
import { declineUnderstanding } from "./service";

const run = TEST_DB ? describe : describe.skip;

interface Fixture {
  certId: string;
  conceptId: string;
  /** Items des Konzepts */
  items: string[];
  /** Kontroll-Item außerhalb des Konzepts */
  control: string;
  /** Varianten je Item (drei, alle probe_only) */
  variants: Map<string, string[]>;
  wrongOption: Map<string, string>;
  correctOption: Map<string, string>;
}

async function addOptions(questionId: string, fx: Pick<Fixture, "wrongOption" | "correctOption">) {
  const [correct, wrong] = await getDb()
    .insert(questionOptions)
    .values([
      { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
      { questionId, orderNum: 2, text: { de: "Verwechslung", en: "Confusion" } as never, isCorrect: false, rationale: { de: "Das verwechselt A mit B.", en: "This mixes up A and B." } as never },
      { questionId, orderNum: 3, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
    ])
    .returning();
  fx.correctOption.set(questionId, correct.id);
  fx.wrongOption.set(questionId, wrong.id);
}

async function seedFixture(): Promise<Fixture> {
  const course = await seedCourse(3);
  const db = getDb();
  const fx: Fixture = { certId: course.certId, conceptId: "", items: course.questionIds.slice(0, 2), control: course.questionIds[2], variants: new Map(), wrongOption: new Map(), correctOption: new Map() };
  const [concept] = await db.insert(concepts).values({ courseId: course.certId, topicArea: "T", name: `Konzept ${randomUUID().slice(0, 6)}` }).returning();
  fx.conceptId = concept.id;
  for (const q of course.questionIds) await addOptions(q, fx);
  for (const itemId of fx.items) {
    await db.insert(itemConcepts).values({ itemId, conceptId: concept.id });
    const list: string[] = [];
    for (let n = 0; n < 3; n++) {
      const [v] = await db.insert(questions).values({ humanId: `UV-${randomUUID().slice(0, 8)}`, objectiveId: course.objectiveId, difficulty: "easy", type: "single", question: { de: "Variante?", en: "Variant?" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true }).returning();
      await addOptions(v.id, fx);
      await db.insert(itemVariants).values({ itemId, questionId: v.id, source: "generated" });
      list.push(v.id);
    }
    fx.variants.set(itemId, list);
  }
  return fx;
}

/** Legt eine Session mit den gegebenen Items an und schließt sie ab (als hätte die Person sie so beantwortet). */
async function answerSession(userId: string, fx: Fixture, plan: Array<{ itemId: string; shown?: string; pick: "right" | "wrong"; confidence: AnswerConfidence }>) {
  const [session] = await getDb().insert(studySessions).values({ userId, certificationId: fx.certId, status: "planned", goalType: "questions", goalValue: 5 }).returning();
  const answers = [];
  for (const [index, step] of plan.entries()) {
    const [item] = await getDb().insert(studySessionItems).values({ sessionId: session.id, orderNum: index + 1, category: "review", referenceType: "question", referenceId: step.itemId, variantQuestionId: step.shown ?? null }).returning();
    const shown = step.shown ?? step.itemId;
    answers.push({ itemId: item.id, selectedOptionId: (step.pick === "right" ? fx.correctOption : fx.wrongOption).get(shown)!, confidence: step.confidence });
  }
  await completeStudySession(session.id, userId, answers);
  return session.id;
}

async function struggleOf(userId: string, conceptId: string) {
  const [row] = await getDb().select().from(conceptStruggles).where(and(eq(conceptStruggles.userId, userId), eq(conceptStruggles.conceptId, conceptId)));
  return row;
}

run("Verstehens-Modus (echte DB)", () => {
  const userIds: string[] = [];
  const newUser = async () => {
    const id = await seedUser();
    userIds.push(id);
    return id;
  };
  beforeAll(() => {
    delete process.env.FEATURE_UNDERSTANDING_MODE;
    process.env.FEATURE_RECALL_CHECK = "0"; // der Rückblick soll die Zählung der Session-Items nicht stören
  });
  afterAll(async () => {
    delete process.env.FEATURE_RECALL_CHECK;
    for (const id of userIds) await getDb().delete(users).where(eq(users.id, id));
  });

  it("ein einzelner Fehler löst nichts aus", async () => {
    const userId = await newUser();
    const fx = await seedFixture();
    await answerSession(userId, fx, [{ itemId: fx.items[0], pick: "wrong", confidence: "sure" }]);
    expect(await struggleOf(userId, fx.conceptId)).toBeUndefined();
  });

  it("dieselbe falsche Option mit „sicher“ und Fehler bei zwei Varianten führt in den Verstehens-Modus; Items pausieren; neue Variante richtig → resolved", async () => {
    const userId = await newUser();
    const fx = await seedFixture();
    const [item] = fx.items;
    const [v1, v2, v3] = fx.variants.get(item)!;

    await answerSession(userId, fx, [{ itemId: item, pick: "wrong", confidence: "sure" }]);
    expect(await struggleOf(userId, fx.conceptId)).toBeUndefined();
    await answerSession(userId, fx, [{ itemId: item, shown: v1, pick: "wrong", confidence: "sure" }]);

    const struggle = await struggleOf(userId, fx.conceptId);
    expect(struggle.status).toBe("detected");
    expect(struggle.signals.map((s) => s.kind)).toEqual(expect.arrayContaining(["sure_wrong", "distinct_variant_failures"]));

    // Items des Konzepts kommen nicht als normale Wiederholung - auch wenn sie fällig sind
    await getDb().update(itemStates).set({ due: new Date(Date.now() - 86_400_000) }).where(eq(itemStates.userId, userId));
    const session = await startStudySession(userId, fx.certId, 10);
    const { items } = await getStudySessionWithContent(session.id, userId);
    const rows = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, session.id));
    const regularRefs = rows.filter((r) => r.category === "review" || r.category === "weak").map((r) => r.referenceId);
    for (const itemId of fx.items) expect(regularRefs).not.toContain(itemId);

    // Verstehens-Aufgabe: eine noch nicht gezeigte Variante
    const understand = items.find((i) => i.category === "understand")!;
    expect(understand).toBeDefined();
    expect([...fx.variants.values()].flat().filter((q) => q !== v1)).toContain(understand.question!.questionId);
    expect(understand.understand?.conceptName).toContain("Konzept");

    // richtige Antwort → resolved, ohne FSRS-Review für die Verstehens-Aufgabe
    const before = (await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).length;
    const answers = [];
    for (const i of items) {
      const shown = i.question!.questionId;
      answers.push({ itemId: i.itemId, selectedOptionId: fx.correctOption.get(shown) ?? (await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, shown), eq(questionOptions.isCorrect, true))))[0].id, confidence: "sure" as const });
    }
    await completeStudySession(session.id, userId, answers);
    expect((await struggleOf(userId, fx.conceptId)).status).toBe("resolved");
    const understandReviews = (await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).length - before;
    expect(understandReviews).toBe(items.filter((i) => i.category !== "understand").length);

    // danach wieder normale Wiederholung
    await getDb().update(itemStates).set({ due: new Date(Date.now() - 86_400_000) }).where(eq(itemStates.userId, userId));
    const next = await startStudySession(userId, fx.certId, 10);
    const nextRows = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, next.id));
    expect(nextRows.some((r) => r.category === "understand")).toBe(false);
  });

  it("zeigt die wiederholte falsche Option als häufige Verwechslung", async () => {
    const userId = await newUser();
    const fx = await seedFixture();
    const [item] = fx.items;
    await answerSession(userId, fx, [{ itemId: item, pick: "wrong", confidence: "unsure" }]);
    await answerSession(userId, fx, [{ itemId: item, pick: "wrong", confidence: "unsure" }]); // dieselbe falsche Option, gleiche Frage
    await answerSession(userId, fx, [{ itemId: item, shown: fx.variants.get(item)![0], pick: "wrong", confidence: "unsure" }]);
    const struggle = await struggleOf(userId, fx.conceptId);
    expect(struggle.signals.map((s) => s.kind)).toEqual(expect.arrayContaining(["repeated_wrong_option", "distinct_variant_failures"]));
    const session = await startStudySession(userId, fx.certId, 10);
    const understand = (await getStudySessionWithContent(session.id, userId)).items.find((i) => i.category === "understand")!;
    expect(understand.understand?.confusion?.rationale?.de).toBe("Das verwechselt A mit B.");
  });

  it("falsche Antwort auf die Verstehens-Aufgabe: in_progress, nächste Variante; Ablehnen: declined und Items wieder normal", async () => {
    const userId = await newUser();
    const fx = await seedFixture();
    const [item] = fx.items;
    await answerSession(userId, fx, [{ itemId: item, pick: "wrong", confidence: "sure" }]);
    await answerSession(userId, fx, [{ itemId: item, shown: fx.variants.get(item)![0], pick: "wrong", confidence: "sure" }]);

    const first = await startStudySession(userId, fx.certId, 10);
    const content = await getStudySessionWithContent(first.id, userId);
    const task = content.items.find((i) => i.category === "understand")!;
    const wrong = (await getDb().select().from(questionOptions).where(and(eq(questionOptions.questionId, task.question!.questionId), eq(questionOptions.isCorrect, false))))[0];
    await completeStudySession(first.id, userId, [{ itemId: task.itemId, selectedOptionId: wrong.id, confidence: "unsure" }]);
    expect((await struggleOf(userId, fx.conceptId)).status).toBe("in_progress");

    const second = await startStudySession(userId, fx.certId, 10);
    const secondTask = (await getStudySessionWithContent(second.id, userId)).items.find((i) => i.category === "understand")!;
    expect(secondTask.question!.questionId).not.toBe(task.question!.questionId); // eine andere, neue Variante

    expect(await declineUnderstanding(second.id, userId)).toBe(1);
    expect((await struggleOf(userId, fx.conceptId)).status).toBe("declined");
    expect((await getStudySessionWithContent(second.id, userId)).items.some((i) => i.category === "understand")).toBe(false);
  });

  it("ist mit FEATURE_UNDERSTANDING_MODE=0 abschaltbar", async () => {
    process.env.FEATURE_UNDERSTANDING_MODE = "0";
    try {
      const userId = await newUser();
      const fx = await seedFixture();
      await answerSession(userId, fx, [{ itemId: fx.items[0], pick: "wrong", confidence: "sure" }]);
      await answerSession(userId, fx, [{ itemId: fx.items[0], shown: fx.variants.get(fx.items[0])![0], pick: "wrong", confidence: "sure" }]);
      expect(await struggleOf(userId, fx.conceptId)).toBeUndefined();
    } finally {
      delete process.env.FEATURE_UNDERSTANDING_MODE;
    }
  });
});
