/** Häufung am Konzept → Werkstatt-Prüfliste, gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { conceptStruggles, concepts, contentReports, itemConcepts, itemStates, questionOptions, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { listOpenQuestionReports } from "@/lib/server/content-reports/service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { flagConceptHotspots } from "./hotspots";
import { isHotspot } from "./rules";

const run = TEST_DB ? describe : describe.skip;

describe("Häufung: Regel", () => {
  it("braucht genug Lernende und einen hohen Anteil", () => {
    expect(isHotspot(20, 6)).toBe(true);
    expect(isHotspot(20, 5)).toBe(false);
    expect(isHotspot(19, 19)).toBe(false);
  });
});

run("Häufung am Konzept (echte DB)", () => {
  async function seed(learners: number, struggling: number) {
    const db = getDb();
    const course = await seedCourse(2);
    const [concept] = await db.insert(concepts).values({ courseId: course.certId, topicArea: "T", name: `Konzept ${randomUUID().slice(0, 6)}` }).returning();
    for (const itemId of course.questionIds) await db.insert(itemConcepts).values({ itemId, conceptId: concept.id });
    const [, wrong] = await db
      .insert(questionOptions)
      .values([
        { questionId: course.questionIds[0], orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
        { questionId: course.questionIds[0], orderNum: 2, text: { de: "Die Verwechslung", en: "The mix-up" } as never, isCorrect: false },
      ])
      .returning();
    for (let i = 0; i < learners; i++) {
      const userId = await seedUser();
      await db.insert(itemStates).values({ userId, itemId: course.questionIds[0], stability: 3, difficulty: 5, reps: 2, lapses: 1, fsrsState: 2, lastReview: new Date(), due: new Date() });
      if (i < struggling) {
        await db.insert(conceptStruggles).values({ userId, conceptId: concept.id, status: "detected" });
        const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 5, completedAt: new Date() }).returning();
        await db.insert(studySessionItems).values({ sessionId: session.id, orderNum: 1, category: "review", referenceType: "question", referenceId: course.questionIds[0], outcome: "incorrect", selectedOptionId: wrong.id });
      }
    }
    return { ...course, conceptId: concept.id };
  }

  it("meldet ein Konzept ab 30 % bei mindestens 20 Lernenden mit häufigster falscher Option, ohne Doppelmeldung und ohne Personenbezug", async () => {
    const fx = await seed(20, 6);
    expect(await flagConceptHotspots([fx.conceptId])).toBe(1);
    expect(await flagConceptHotspots([fx.conceptId])).toBe(0);
    const reports = await getDb().select().from(contentReports).where(and(eq(contentReports.targetId, fx.questionIds[0]), eq(contentReports.reason, "concept_struggle")));
    expect(reports).toHaveLength(1);
    expect(reports[0].reporterUserId).toBeNull();
    expect(reports[0].detail).toMatchObject({ conceptId: fx.conceptId, learners: 20, struggling: 6, topWrongOption: { count: 6 } });
    expect(reports[0].detail!.topWrongOption!.text.de).toBe("Die Verwechslung");
    expect(JSON.stringify(reports[0].detail)).not.toMatch(/user/i);
    const listed = await listOpenQuestionReports(fx.certId);
    expect(listed.map((r) => r.reason)).toEqual(["concept_struggle"]);
    expect(listed[0].detail?.struggling).toBe(6);
  });

  it("meldet nichts bei zu wenigen Lernenden oder zu geringem Anteil", async () => {
    const few = await seed(10, 10);
    expect(await flagConceptHotspots([few.conceptId])).toBe(0);
    const low = await seed(20, 5);
    expect(await flagConceptHotspots([low.conceptId])).toBe(0);
  });
});
