/** Voraussetzungen und Grundlagen-Check gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { conceptPrerequisites, conceptStruggles, concepts, itemConcepts, itemVariants, questionOptions, questions, reviewLog, studySessionItems } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { completeStudySession, getStudySessionWithContent, startStudySession } from "@/lib/server/study/session-service";
import { declineUnderstanding } from "@/lib/server/understanding/service";
import { backfillPrerequisites, type PrerequisiteGenerator } from "./generate";
import { listDraftPrerequisites, planPrereqCheck, reviewPrerequisite } from "./service";

const run = TEST_DB ? describe : describe.skip;

run("Voraussetzungen und Grundlagen-Check (echte DB)", () => {
  async function setup() {
    const course = await seedCourse(4);
    const db = getDb();
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(async (n) => (await db.insert(concepts).values({ courseId: course.certId, topicArea: "T", name: `${n} ${randomUUID().slice(0, 6)}` }).returning())[0]));
    const [qa, qb, qc] = course.questionIds;
    for (const [q, concept] of [[qa, a], [qb, b], [qc, c]] as const) await db.insert(itemConcepts).values({ itemId: q, conceptId: concept.id });
    for (const q of course.questionIds) {
      await db.insert(questionOptions).values([
        { questionId: q, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
        { questionId: q, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
      ]);
    }
    // Variante für die Verstehens-Aufgabe zu A
    const [v] = await db.insert(questions).values({ humanId: `PV-${randomUUID().slice(0, 8)}`, objectiveId: course.objectiveId, difficulty: "easy", type: "single", question: { de: "V?", en: "V?" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true }).returning();
    await db.insert(questionOptions).values([
      { questionId: v.id, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
      { questionId: v.id, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
    ]);
    await db.insert(itemVariants).values({ itemId: qa, questionId: v.id, source: "generated" });
    const [sectionId] = await seedLessons(course.objectiveId, ["Grundlagen-Text"]);
    return { ...course, a, b, c, qa, qb, qc, sectionId };
  }

  it("schlägt Voraussetzungen nur als Entwurf vor: ohne Zyklen und Selbstbezüge, wiederholbar, ohne Wirkung vor der Freigabe", async () => {
    const fx = await setup();
    const userId = await seedUser();
    const list = [fx.a, fx.b, fx.c].sort((x, y) => (x.name < y.name ? -1 : 1));
    const idx = (id: string) => list.findIndex((x) => x.id === id);
    const generator: PrerequisiteGenerator = async () => [
      { concept: idx(fx.a.id), requires: [idx(fx.b.id), idx(fx.c.id), idx(fx.a.id)] },
      { concept: idx(fx.b.id), requires: [idx(fx.a.id)] }, // würde einen Kreis bilden
    ];
    const first = await backfillPrerequisites(fx.certId, generator);
    expect(first).toMatchObject({ created: 2, failed: 0 });
    expect((await backfillPrerequisites(fx.certId, generator)).created).toBe(0);
    expect(await listDraftPrerequisites(fx.certId)).toHaveLength(2);

    await getDb().insert(conceptStruggles).values({ userId, conceptId: fx.a.id, status: "detected" });
    expect(await planPrereqCheck(userId, fx.certId)).toBeNull(); // Entwürfe wirken nicht
    const [struggle] = await getDb().select().from(conceptStruggles).where(eq(conceptStruggles.userId, userId));
    expect(struggle.prereqCheckedAt).not.toBeNull(); // kein Blockieren der Verstehens-Aufgabe
  });

  it("Grundlagen-Check mit freigegebenen Voraussetzungen: 2-3 Fragen, schwache Voraussetzung → Brückenlektion, dann zurück zum Konzept", async () => {
    const fx = await setup();
    const userId = await seedUser();
    const db = getDb();
    const reviewer = await seedUser();
    await db.insert(conceptPrerequisites).values([
      { conceptId: fx.a.id, requiresConceptId: fx.b.id, status: "draft" },
      { conceptId: fx.a.id, requiresConceptId: fx.c.id, status: "draft" },
    ]);
    for (const d of await listDraftPrerequisites(fx.certId)) await reviewPrerequisite({ id: d.id, reviewerUserId: reviewer, decision: "approved" });
    await db.insert(conceptStruggles).values({ userId, conceptId: fx.a.id, status: "detected" });

    // Session 1: Grundlagen-Check statt Verstehens-Aufgabe; Items von A bleiben pausiert
    const s1 = await startStudySession(userId, fx.certId, 10);
    const { items: items1 } = await getStudySessionWithContent(s1.id, userId);
    const prereq = items1.filter((i) => i.category === "prereq");
    expect(prereq.length).toBe(2);
    expect(items1.some((i) => i.category === "understand")).toBe(false);
    const wrongOf = async (questionId: string) => (await db.select().from(questionOptions).where(and(eq(questionOptions.questionId, questionId), eq(questionOptions.isCorrect, false))))[0].id;
    const correctOf = async (questionId: string) => (await db.select().from(questionOptions).where(and(eq(questionOptions.questionId, questionId), eq(questionOptions.isCorrect, true))))[0].id;
    const answers = [];
    for (const i of items1.filter((x) => x.question)) {
      const q = i.question!.questionId;
      // die Frage zu B falsch, alle anderen richtig
      answers.push({ itemId: i.itemId, selectedOptionId: q === fx.qb ? await wrongOf(q) : await correctOf(q), confidence: "sure" as const });
    }
    const logsBefore = (await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).length;
    await completeStudySession(s1.id, userId, answers);
    // Grundlagen-Fragen sind kein FSRS-Review und lösen/verändern das Konzept nicht
    const logsAfter = (await db.select().from(reviewLog).where(eq(reviewLog.userId, userId))).length;
    expect(logsAfter - logsBefore).toBe(items1.filter((i) => i.question && i.category !== "prereq").length);
    const [after] = await db.select().from(conceptStruggles).where(eq(conceptStruggles.userId, userId));
    expect(after.status).toBe("detected");
    expect(after.prereqCheckedAt).not.toBeNull();
    expect(after.bridgeConceptId).toBe(fx.b.id);
    expect(after.bridgeSectionId).toBe(fx.sectionId);

    // Session 2: Verstehens-Aufgabe mit Brückenlektion davor; Check kommt nicht noch einmal
    const s2 = await startStudySession(userId, fx.certId, 10);
    const { items: items2 } = await getStudySessionWithContent(s2.id, userId);
    expect(items2.some((i) => i.category === "prereq")).toBe(false);
    const understand = items2.find((i) => i.category === "understand")!;
    expect(understand.understand?.bridge).toMatchObject({ conceptName: fx.b.name, sectionId: fx.sectionId });
    // Verstehens-Aufgabe richtig beantwortet: Konzept gelöst, Brücke nicht mehr nötig
    const done = [];
    for (const i of items2.filter((x) => x.question)) done.push({ itemId: i.itemId, selectedOptionId: await correctOf(i.question!.questionId), confidence: "sure" as const });
    await completeStudySession(s2.id, userId, done);
    const [resolved] = await db.select().from(conceptStruggles).where(eq(conceptStruggles.userId, userId));
    expect(resolved).toMatchObject({ status: "resolved", bridgeSectionId: null, bridgeConceptId: null });
  });

  it("alle Grundlagen richtig: keine Brückenlektion; Ablehnen entfernt den Check", async () => {
    const fx = await setup();
    const userId = await seedUser();
    const db = getDb();
    const reviewer = await seedUser();
    await db.insert(conceptPrerequisites).values({ conceptId: fx.a.id, requiresConceptId: fx.b.id, status: "draft" });
    for (const d of await listDraftPrerequisites(fx.certId)) await reviewPrerequisite({ id: d.id, reviewerUserId: reviewer, decision: "approved" });
    await db.insert(conceptStruggles).values({ userId, conceptId: fx.a.id, status: "detected" });
    const s1 = await startStudySession(userId, fx.certId, 10);
    expect((await db.select().from(studySessionItems).where(and(eq(studySessionItems.sessionId, s1.id), eq(studySessionItems.category, "prereq")))).length).toBe(1);
    const [struggle] = await db.select().from(conceptStruggles).where(eq(conceptStruggles.userId, userId));
    expect(await declineUnderstanding(s1.id, userId)).toBe(1);
    expect((await db.select().from(conceptStruggles).where(eq(conceptStruggles.id, struggle.id)))[0].status).toBe("declined");
    expect(await db.select().from(studySessionItems).where(and(eq(studySessionItems.sessionId, s1.id), eq(studySessionItems.category, "prereq")))).toHaveLength(0);
  });
});
