/** Auswertung der neuen Antwortformate in Session, Aufdeckung und Lektionstest gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, questions, quizAnswers, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { completeStudySession, getStudySessionWithContent, revealStudySessionAnswer } from "@/lib/server/study/session-service";
import type { AnswerData, AnswerFormat } from "@/lib/questions/answer-formats";

const run = TEST_DB ? describe : describe.skip;
const t = (de: string) => ({ de, en: de });

const ORDERING: AnswerData = { steps: [{ id: "a", text: t("Erkennen") }, { id: "b", text: t("Eingrenzen") }, { id: "c", text: t("Beheben") }] };
const SHORT: AnswerData = { accepted: ["ipconfig /all"] };
const MATCHING: AnswerData = { pairs: [{ id: "p1", left: t("DNS"), right: t("Namen") }, { id: "p2", left: t("DHCP"), right: t("Adressen") }] };

async function setFormat(questionId: string, format: AnswerFormat, data: AnswerData | null) {
  await getDb().update(questions).set({ answerFormat: format, answerData: data }).where(eq(questions.id, questionId));
}

run("Antwortformate (echte DB)", () => {
  async function seedSession(userId: string, certId: string, questionIds: string[]) {
    const db = getDb();
    const [session] = await db.insert(studySessions).values({ userId, certificationId: certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
    const items = await db
      .insert(studySessionItems)
      .values(questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id })))
      .returning();
    return { sessionId: session.id, itemIds: items.map((i) => i.id) };
  }

  it("Session: Aufgabe ohne Lösung, Aufdeckung mit Lösung, Wertung binär und Antwort gespeichert", async () => {
    const course = await seedCourse(3);
    const userId = await seedUser();
    const [qOrder, qShort, qMatch] = course.questionIds;
    await setFormat(qOrder, "ordering", ORDERING);
    await setFormat(qShort, "short_answer", SHORT);
    await setFormat(qMatch, "matching", MATCHING);
    const { sessionId, itemIds } = await seedSession(userId, course.certId, [qOrder, qShort, qMatch]);

    const content = await getStudySessionWithContent(sessionId, userId);
    const first = content.items[0].question!;
    expect(first.format).toBe("ordering");
    expect(first.options).toEqual([]);
    expect(JSON.stringify(content.items[1].question)).not.toContain("ipconfig"); // Kurzantwort-Lösung bleibt serverseitig
    const prompt = first.prompt!;
    expect(prompt.format === "ordering" && prompt.steps.map((s) => s.id)).not.toEqual(["a", "b", "c"]);

    const wrong = await revealStudySessionAnswer(sessionId, userId, itemIds[0], "", { kind: "ordering", order: ["a", "c", "b"] });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.solution).toMatchObject({ format: "ordering" });
    expect(wrong.partial).toBeCloseTo(1 / 3);

    const result = await completeStudySession(sessionId, userId, [
      { itemId: itemIds[0], selectedOptionId: "", answer: { kind: "ordering", order: ["a", "b", "c"] } },
      { itemId: itemIds[1], selectedOptionId: "", answer: { kind: "short_answer", text: "  IPConfig /ALL " } },
      { itemId: itemIds[2], selectedOptionId: "", answer: { kind: "matching", matches: { p1: "p1", p2: "p1" } } },
    ]);
    expect(result.results.map((r) => r.isCorrect)).toEqual([true, true, false]);
    const stored = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, sessionId));
    expect(stored.find((i) => i.id === itemIds[1])?.answer).toEqual({ kind: "short_answer", text: "  IPConfig /ALL " });
  });

  it("kaputte Antwort zählt als falsch und wird nicht gespeichert", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await setFormat(course.questionIds[0], "ordering", ORDERING);
    const { sessionId, itemIds } = await seedSession(userId, course.certId, course.questionIds);
    const result = await completeStudySession(sessionId, userId, [{ itemId: itemIds[0], selectedOptionId: "", answer: { kind: "ordering", order: "abc" } as never }]);
    expect(result.results[0].isCorrect).toBe(false);
  });

  it("Lektionstest: neue Formate werden serverseitig gewertet und gespeichert", async () => {
    const course = await seedCourse(2);
    const userId = await seedUser();
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    await setFormat(course.questionIds[0], "short_answer", SHORT);
    await setFormat(course.questionIds[1], "matching", MATCHING);
    const result = await recordSectionQuizAttempt(userId, sectionId, [
      { questionId: course.questionIds[0], selectedOptionId: "", answer: { kind: "short_answer", text: "ipconfig /all" } },
      { questionId: course.questionIds[1], selectedOptionId: "", answer: { kind: "matching", matches: { p1: "p1", p2: "p2" } } },
    ]);
    expect(result.results.every((r) => r.isCorrect)).toBe(true);
    const rows = await getDb().select().from(quizAnswers).where(eq(quizAnswers.questionId, course.questionIds[0]));
    expect(rows[0].answer).toEqual({ kind: "short_answer", text: "ipconfig /all" });
    expect(rows[0].selectedOptionId).toBeNull();
  });

  it("Auswahlfragen bleiben unverändert", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    const [opt] = await getDb().insert(questionOptions).values([
      { questionId: course.questionIds[0], orderNum: 1, text: t("R"), isCorrect: true },
      { questionId: course.questionIds[0], orderNum: 2, text: t("F"), isCorrect: false },
    ]).returning();
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    const result = await recordSectionQuizAttempt(userId, sectionId, [{ questionId: course.questionIds[0], selectedOptionId: opt.id }]);
    expect(result.results[0].isCorrect).toBe(true);
  });
});
