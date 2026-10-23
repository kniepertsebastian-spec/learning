/** Einstiegstest gegen echte DB: Auswertung, Überspringen, Pflichtkurs-Regel. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import {
  companyAssignments, domains, itemStates, lessonCompletions, lessonSkips, mandatoryRules, objectives, organizationMemberships, organizations,
  questionOptions, questions, users,
} from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { loadPlacementTest, placementSkipAllowed, submitPlacement, type PlacementSubmission } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function addOptions(questionId: string) {
  await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
    { questionId, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
  ]);
}

run("Einstiegstest (echte DB)", () => {
  let userId = "";
  let certId = "";
  let domainId = "";
  let objectiveIds: string[] = [];
  let questionIds: string[] = [];

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    const [first] = await getDb().select().from(objectives).where(eq(objectives.id, course.objectiveId));
    domainId = first.domainId;
    objectiveIds = [course.objectiveId];
    questionIds = [course.questionIds[0]];
    // Zwei weitere Lernziele mit je einer Frage; alle drei Lernziele haben eine Lektion
    for (const code of ["B", "C"]) {
      const [o] = await getDb().insert(objectives).values({ domainId, code: `${code}-${randomUUID().slice(0, 4)}`, title: `Lernziel ${code}` }).returning();
      const [q] = await getDb().insert(questions).values({ humanId: `PL-${randomUUID().slice(0, 8)}`, objectiveId: o.id, difficulty: "easy", type: "single", question: { de: "F", en: "Q" } as never, explanation: { de: "E", en: "E" } as never }).returning();
      objectiveIds.push(o.id);
      questionIds.push(q.id);
    }
    for (const q of questionIds) await addOptions(q);
    for (const o of objectiveIds) await seedLessons(o, ["Text"]);
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  async function answers(opts: { wrongIndex?: number; confidence?: PlacementSubmission["confidence"] } = {}): Promise<PlacementSubmission[]> {
    const test = await loadPlacementTest(userId, domainId);
    const correct = await getDb().select().from(questionOptions);
    return test.questions.map((q, i) => {
      const options = correct.filter((o) => o.questionId === q.questionId);
      const pick = i === opts.wrongIndex ? options.find((o) => !o.isCorrect)! : options.find((o) => o.isCorrect)!;
      return { questionId: q.questionId, selectedOptionId: pick.id, confidence: opts.confidence ?? "sure" };
    });
  }

  it("stellt je Lernziel eine Frage ohne Lösung zusammen", async () => {
    const test = await loadPlacementTest(userId, domainId);
    expect(test.questions).toHaveLength(3);
    expect(JSON.stringify(test)).not.toContain("isCorrect");
    expect(test.skipAllowed).toBe(true);
  });

  it("nicht bestanden: nichts wird übersprungen, schwache Lernziele werden genannt", async () => {
    const first = (await loadPlacementTest(userId, domainId)).questions[0]; // nach Lernziel-Code sortiert
    const result = await submitPlacement(userId, domainId, await answers({ wrongIndex: 0 }));
    expect(result.passed).toBe(false);
    expect(result.skipApplied).toBe(false);
    expect(result.open.map((o) => o.objectiveId)).toEqual([first.objectiveId]);
    expect(result.open[0].firstSectionId).not.toBeNull();
    expect(await getDb().select().from(lessonSkips).where(eq(lessonSkips.userId, userId))).toHaveLength(0);
    expect(await getDb().select().from(itemStates).where(eq(itemStates.userId, userId))).toHaveLength(0);
  });

  it("bestanden: Lektionen werden übersprungen (nicht abgeschlossen), Items starten mit Rating 4 im FSRS-Zustand", async () => {
    const result = await submitPlacement(userId, domainId, await answers());
    expect(result).toMatchObject({ passed: true, skipApplied: true, skippedLessons: 3, open: [] });
    expect(await getDb().select().from(lessonSkips).where(eq(lessonSkips.userId, userId))).toHaveLength(3);
    expect(await getDb().select().from(lessonCompletions).where(eq(lessonCompletions.userId, userId))).toHaveLength(0);
    const states = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    expect(states.map((s) => s.itemId).sort()).toEqual([...questionIds].sort());
  });

  it("Pflichtkurs: Überspringen nur mit Erlaubnis der Pflichtregel", async () => {
    const learner = await seedUser();
    const [org] = await getDb().insert(organizations).values({ name: `Org ${randomUUID().slice(0, 6)}` } as never).returning();
    await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: learner, role: "learner" });
    expect(await placementSkipAllowed(learner, certId)).toBe(true);

    const [rule] = await getDb().insert(mandatoryRules).values({ organizationId: org.id, certificationId: certId, roles: ["learner"], dueInDays: 30 }).returning();
    await getDb().insert(companyAssignments).values({ organizationId: org.id, userId: learner, certificationId: certId, mandatoryRuleId: rule.id });
    expect(await placementSkipAllowed(learner, certId)).toBe(false);

    const test = await loadPlacementTest(learner, domainId);
    expect(test.skipAllowed).toBe(false);
    const submissions = await answers();
    const blocked = await submitPlacement(learner, domainId, submissions);
    expect(blocked).toMatchObject({ passed: true, skipApplied: false, skipAllowed: false, skippedLessons: 0 });
    expect(await getDb().select().from(lessonSkips).where(eq(lessonSkips.userId, learner))).toHaveLength(0);

    await getDb().update(mandatoryRules).set({ allowPlacementSkip: true }).where(eq(mandatoryRules.id, rule.id));
    expect(await placementSkipAllowed(learner, certId)).toBe(true);
    expect(await submitPlacement(learner, domainId, submissions)).toMatchObject({ skipApplied: true, skippedLessons: 3 });

    await getDb().delete(users).where(eq(users.id, learner));
    await getDb().delete(organizations).where(eq(organizations.id, org.id));
  });
});
