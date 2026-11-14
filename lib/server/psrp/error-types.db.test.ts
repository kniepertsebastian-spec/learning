/** Aufgabe 15 (Review 12.11.2026): Fehlerart und Hilfe-Verhalten aus vorhandenen Tabellen (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { concepts, itemConcepts, learningExits, mentorRequests, organizationMemberships, organizations, questionOptions, reviewLog, simulationResults, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "./test-db";
import { STABLE_BASE_MIN_N } from "./guessing";
import { hasMisconception, loadErrorTypeRows, loadHelpUsers } from "./error-types-db";
import { computeErrorTypes, computeHelpBehavior } from "./error-types";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup() {
  const db = getDb();
  const course = await seedCourse(4);
  const options = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const rows = await db
        .insert(questionOptions)
        .values([{ questionId, orderNum: 1, text: t("R"), isCorrect: true }, { questionId, orderNum: 2, text: t("A"), isCorrect: false }, { questionId, orderNum: 3, text: t("B"), isCorrect: false }])
        .returning();
      return { right: rows[0].id, a: rows[1].id, b: rows[2].id };
    }),
  );
  const [concept] = await db.insert(concepts).values({ courseId: course.certId, topicArea: "T", name: `Konzept ${course.tag}` }).returning();
  await db.insert(itemConcepts).values(course.questionIds.map((itemId) => ({ itemId, conceptId: concept.id })));
  const userId = await seedUser();
  await db.update(users).set({ evaluationGroup: "planning" }).where(eq(users.id, userId));
  return { ...course, options, concept, userId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Eine abgeschlossene Sitzung; `ms` landet mit der Antwort in review_log. */
async function session(s: Setup, answers: Array<{ q: number; pick: "right" | "a" | "b" | null; sure?: boolean; ms?: number }>) {
  const db = getDb();
  const [row] = await db.insert(studySessions).values({ userId: s.userId, certificationId: s.certId, status: "completed", goalType: "questions", goalValue: answers.length, completedAt: new Date() }).returning();
  for (const [i, a] of answers.entries()) {
    const itemId = s.questionIds[a.q];
    await db.insert(studySessionItems).values({
      sessionId: row.id,
      orderNum: i,
      category: "review",
      referenceType: "question",
      referenceId: itemId,
      outcome: a.pick === null ? null : a.pick === "right" ? "correct" : "incorrect",
      selectedOptionId: a.pick === null ? null : s.options[a.q][a.pick],
      confidence: a.sure ? "sure" : "unsure",
    });
    if (a.pick !== null && a.ms !== undefined) {
      await db.insert(reviewLog).values({ userId: s.userId, itemId, sessionId: row.id, localHour: 10, weekday: 2, rawRating: a.pick === "right" ? 3 : 1, responseTimeMs: a.ms });
    }
  }
}

run("Fehlerart und Hilfe-Verhalten (echte DB)", () => {
  it("ordnet je Person und Frage ein: Fehlvorstellung, Lücke, Flüchtigkeit, unbekannt", async () => {
    const s = await setup();
    // Basiszeit 6 s je Frage von einer anderen Person (ohne Evaluationsgruppe, zählt also nicht selbst)
    const other = await seedUser();
    await getDb().insert(reviewLog).values(s.questionIds.flatMap((itemId) => Array.from({ length: STABLE_BASE_MIN_N }, () => ({ userId: other, itemId, sessionId: randomUUID(), localHour: 10, weekday: 2, rawRating: 3, responseTimeMs: 6000 }))));

    await session(s, [{ q: 0, pick: "a" }, { q: 1, pick: "a" }, { q: 2, pick: "right", ms: 5000 }, { q: 3, pick: "a" }]);
    await session(s, [{ q: 0, pick: "a" }, { q: 1, pick: "b" }, { q: 2, pick: "right", ms: 5000 }]);
    await session(s, [{ q: 0, pick: "right" }, { q: 1, pick: "right" }, { q: 2, pick: "a", ms: 1500 }]);

    const rows = (await loadErrorTypeRows(new Date())).filter((r) => r.question.startsWith(`Q-${s.tag}`));
    const result = computeErrorTypes(rows);
    expect(result.byQuestion[`Q-${s.tag}-0`]).toMatchObject({ misconception: 1 });
    expect(result.byQuestion[`Q-${s.tag}-1`]).toMatchObject({ gap: 1 });
    expect(result.byQuestion[`Q-${s.tag}-2`]).toMatchObject({ slip: 1 });
    expect(result.byQuestion[`Q-${s.tag}-3`]).toMatchObject({ unknown: 1 });
    expect(result.totals.questionsWithErrors).toBe(4);
    expect(Object.keys(result.byConcept)).toEqual([`Konzept ${s.tag} [${s.concept.id.slice(0, 8)}]`]);

    const from = new Date(Date.now() - 86_400_000);
    expect(await hasMisconception(s.userId, [s.questionIds[0]], from, null)).toBe(true);
    expect(await hasMisconception(s.userId, [s.questionIds[1], s.questionIds[2], s.questionIds[3]], from, null)).toBe(false);
    // nach einer Lösung zählen nur neuere Antworten
    expect(await hasMisconception(s.userId, [s.questionIds[0]], from, new Date())).toBe(false);
  });

  it("Hilfe-Verhalten: Simulationen mit Hilfe, „Ich hänge fest“, offen gelassene Fragen und Notausstiege", async () => {
    const s = await setup();
    const [section] = await seedLessons(s.objectiveId, ["Text"]);
    await getDb().insert(simulationResults).values([
      { userId: s.userId, sectionId: section, simIndex: 0, solves: 1, bestHelps: 2, lastHelps: 2 },
      { userId: s.userId, sectionId: section, simIndex: 1, solves: 3, bestHelps: 0, lastHelps: 1 },
    ]);
    const [org] = await getDb().insert(organizations).values({ name: `Org ${s.tag}` }).returning();
    await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: s.userId, role: "learner" });
    await getDb().insert(mentorRequests).values({ organizationId: org.id, userId: s.userId, topic: "Thema", message: "Ich hänge fest" });
    await getDb().insert(learningExits).values({ userId: s.userId, source: "session", questionId: s.questionIds[1] });
    await session(s, [{ q: 0, pick: "right" }, { q: 1, pick: null }]);

    const person = (await loadHelpUsers(new Date())).find((p) => p.skips.some((k) => k.question.startsWith(`Q-${s.tag}`)))!;
    expect(person.mentorRequests).toBe(1);
    expect(person.simulations).toHaveLength(2);
    const result = computeHelpBehavior([person]);
    const concept = `Konzept ${s.tag} [${s.concept.id.slice(0, 8)}]`;
    expect(result.simulations.early).toMatchObject({ numerator: 1, n: 1 });
    expect(result.simulations.late).toMatchObject({ numerator: 1, n: 1 });
    expect(result.byQuestion[`Q-${s.tag}-1`]).toEqual({ unanswered: 1, exits: 1 });
    expect(result.byConcept[concept]).toEqual({ simulations: 2, simulationsWithHelp: 2, unanswered: 1, exits: 1 });
    expect(result.people).toMatchObject({ seeksHelp: { numerator: 1 }, skips: { numerator: 1 }, both: { numerator: 1 } });
  });
});
