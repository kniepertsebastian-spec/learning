/** Aufgabe 05a (Nachprüfung 14.11.2026): Prüfungsabgabe serverseitig prüfen. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { examAnswers, examAttempts, examQuestions, exams, questionOptions } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { InvalidExamSubmissionError, parseExamAttemptInput, submitExamAttempt, type ExamAnswerInput } from "./attempt";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function withOptions(questionId: string) {
  const [right, wrong] = await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: t("R"), isCorrect: true },
    { questionId, orderNum: 2, text: t("F"), isCorrect: false },
  ]).returning();
  return { questionId, right: right.id, wrong: wrong.id };
}

/** Prüfung mit `count` Fragen, dazu eine Frage desselben Kurses, die NICHT zur Prüfung gehört. */
async function setup(count = 10) {
  const db = getDb();
  const course = await seedCourse(count + 1);
  const options = await Promise.all(course.questionIds.map(withOptions));
  const inExam = options.slice(0, count);
  const foreign = options[count];
  const [exam] = await db.insert(exams).values({ certificationId: course.certId, blueprint: {} }).returning();
  await db.insert(examQuestions).values(inExam.map((o, i) => ({ examId: exam.id, questionId: o.questionId, orderNum: i })));
  const userId = await seedUser();
  return { userId, examId: exam.id, inExam, foreign };
}

const attemptsOf = async (userId: string) => getDb().select().from(examAttempts).where(eq(examAttempts.userId, userId));

run("Prüfungsabgabe serverseitig (echte DB)", () => {
  it("eine richtige von zehn Antworten (Rest leer) ergibt 10 % und nicht bestanden", async () => {
    const { userId, examId, inExam } = await setup();
    const answers: ExamAnswerInput[] = inExam.map((o, i) => ({ questionId: o.questionId, selectedOptionId: i === 0 ? o.right : "" }));
    const result = await submitExamAttempt(userId, examId, { answers });
    expect(result.score).toBe(10);
    expect(result.passed).toBe(false);
    const [attempt] = await attemptsOf(userId);
    expect(attempt.passed).toBe(false);
    expect(await getDb().select().from(examAnswers).where(eq(examAnswers.examAttemptId, attempt.id))).toHaveLength(10);
  });

  it("nur eine eingereichte (richtige) Antwort wird abgelehnt, es entsteht kein Versuch", async () => {
    const { userId, examId, inExam } = await setup();
    await expect(submitExamAttempt(userId, examId, { answers: [{ questionId: inExam[0].questionId, selectedOptionId: inExam[0].right }] })).rejects.toBeInstanceOf(InvalidExamSubmissionError);
    expect(await attemptsOf(userId)).toHaveLength(0);
  });

  it("fremde, doppelte Fragen und fremde Optionen werden abgelehnt", async () => {
    const { userId, examId, inExam, foreign } = await setup(3);
    const all = inExam.map((o) => ({ questionId: o.questionId, selectedOptionId: o.right }));
    // Fremde Frage statt einer Prüfungsfrage.
    await expect(submitExamAttempt(userId, examId, { answers: [...all.slice(0, 2), { questionId: foreign.questionId, selectedOptionId: foreign.right }] })).rejects.toBeInstanceOf(InvalidExamSubmissionError);
    // Fremde Frage zusätzlich.
    await expect(submitExamAttempt(userId, examId, { answers: [...all, { questionId: foreign.questionId, selectedOptionId: foreign.right }] })).rejects.toBeInstanceOf(InvalidExamSubmissionError);
    // Doppelte Frage-ID (Anzahl stimmt, eine Frage fehlt).
    await expect(submitExamAttempt(userId, examId, { answers: [all[0], all[0], all[1]] })).rejects.toBeInstanceOf(InvalidExamSubmissionError);
    // Option einer anderen Frage.
    await expect(submitExamAttempt(userId, examId, { answers: [all[0], all[1], { questionId: inExam[2].questionId, selectedOptionId: inExam[0].right }] })).rejects.toBeInstanceOf(InvalidExamSubmissionError);
    expect(await attemptsOf(userId)).toHaveLength(0);
  });

  it("vollständig richtig ergibt bestanden; das Ergebnis enthält keine Lösung", async () => {
    const { userId, examId, inExam } = await setup(4);
    const result = await submitExamAttempt(userId, examId, { answers: inExam.map((o, i) => ({ questionId: o.questionId, selectedOptionId: i === 3 ? o.wrong : o.right })) });
    expect(result.score).toBe(75);
    expect(result.passed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("correctOptionId");
    for (const o of inExam) expect(JSON.stringify(result.results)).not.toContain(o.right);
  });
});

describe("parseExamAttemptInput", () => {
  it("lehnt fehlende oder falsch geformte Antworten ab", () => {
    expect(() => parseExamAttemptInput(null)).toThrow(InvalidExamSubmissionError);
    expect(() => parseExamAttemptInput({})).toThrow(InvalidExamSubmissionError);
    expect(() => parseExamAttemptInput({ answers: [{ questionId: 1 }] })).toThrow(InvalidExamSubmissionError);
    expect(() => parseExamAttemptInput({ answers: [{ questionId: "q", selectedOptionId: 5 }] })).toThrow(InvalidExamSubmissionError);
  });

  it("nimmt leere oder fehlende Auswahl als nicht beantwortet", () => {
    expect(parseExamAttemptInput({ answers: [{ questionId: "q" }, { questionId: "r", selectedOptionId: null }], durationSeconds: 12 })).toEqual({
      answers: [{ questionId: "q", selectedOptionId: "" }, { questionId: "r", selectedOptionId: "" }],
      durationSeconds: 12,
    });
  });
});
