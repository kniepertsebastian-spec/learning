/** Aufgabe 04b (Review 12.11.2026): `confidence` nur NULL, guessed, unsure oder sure. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, quizAnswers, quizAttempts, sections, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { processSyncEvents } from "@/lib/server/sync/service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup() {
  const db = getDb();
  const course = await seedCourse(2);
  const options = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [right] = await db.insert(questionOptions).values([
        { questionId, orderNum: 1, text: t("R"), isCorrect: true },
        { questionId, orderNum: 2, text: t("F"), isCorrect: false },
      ]).returning();
      return right.id;
    }),
  );
  const [section] = await db.insert(sections).values({ objectiveId: course.objectiveId, orderNum: 1, title: t("S") }).returning();
  const userId = await seedUser();
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { userId, sectionId: section.id, session, items, options, questionIds: course.questionIds };
}

/** Meldung samt Ursache: Drizzle verpackt den Datenbankfehler. */
const message = (error: unknown) => `${(error as Error).message} ${String((error as { cause?: unknown }).cause ?? "")}`;

run("confidence-Check (echte DB)", () => {
  it("quiz_answers lehnt einen unbekannten Wert ab und nimmt die erlaubten an", async () => {
    const { userId, sectionId, questionIds, options } = await setup();
    await recordSectionQuizAttempt(userId, sectionId, [{ questionId: questionIds[0], selectedOptionId: options[0], confidence: "sure" }]);
    const [attempt] = await getDb().select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
    const db = getDb();
    for (const value of ["guessed", "unsure", "sure", null] as const) {
      await db.update(quizAnswers).set({ confidence: value }).where(eq(quizAnswers.quizAttemptId, attempt.id));
    }
    const error = await db.update(quizAnswers).set({ confidence: "egal" as never }).where(eq(quizAnswers.quizAttemptId, attempt.id)).then(() => null, (e: unknown) => e);
    expect(error).not.toBeNull();
    expect(message(error)).toContain("quiz_answers_confidence_check");
  });

  it("study_session_items lehnt einen unbekannten Wert ab und nimmt die erlaubten an", async () => {
    const { items } = await setup();
    const db = getDb();
    for (const value of ["guessed", "unsure", "sure", null] as const) {
      await db.update(studySessionItems).set({ confidence: value }).where(eq(studySessionItems.id, items[0].id));
    }
    const error = await db.update(studySessionItems).set({ confidence: "SURE" as never }).where(eq(studySessionItems.id, items[0].id)).then(() => null, (e: unknown) => e);
    expect(error).not.toBeNull();
    expect(message(error)).toContain("study_session_items_confidence_check");
  });

  it("Lektionstest mit unbekannter Selbsteinschätzung: die Antwort zählt, die Einschätzung entfällt", async () => {
    const { userId, sectionId, questionIds, options } = await setup();
    const result = await recordSectionQuizAttempt(userId, sectionId, [
      { questionId: questionIds[0], selectedOptionId: options[0], confidence: "egal" as never },
      { questionId: questionIds[1], selectedOptionId: options[1], confidence: "unsure" },
    ]);
    expect(result.results).toHaveLength(2);
    const rows = await getDb().select().from(quizAnswers).where(eq(quizAnswers.quizAttemptId, result.attemptId));
    expect(rows.find((r) => r.questionId === questionIds[0])?.confidence).toBeNull();
    expect(rows.find((r) => r.questionId === questionIds[1])?.confidence).toBe("unsure");
  });

  it("Sync-Ereignis mit unbekannter Selbsteinschätzung wird verbucht statt bei jedem Sync zu scheitern", async () => {
    const { userId, session, items, options } = await setup();
    const [result] = await processSyncEvents(userId, [
      {
        clientEventId: crypto.randomUUID(),
        type: "study_session",
        clientCreatedAt: new Date().toISOString(),
        payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: options[i], confidence: "egal" })) },
      },
    ]);
    expect(result.status).toBe("applied");
    const rows = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, session.id));
    expect(rows.every((r) => r.outcome === "correct" && r.confidence === null)).toBe(true);
  });
});
