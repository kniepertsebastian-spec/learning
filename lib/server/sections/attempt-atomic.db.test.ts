/** Aufgabe 03b (Review 12.11.2026): Lektionstest und Kapitel-Quiz in einer Transaktion. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { domains, objectiveProgress, objectives, questionOptions, quizAnswers, quizAttempts, reviewLog, sections } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { recordChapterQuizAttempt, recordSectionQuizAttempt } from "./attempt-service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup() {
  const db = getDb();
  const course = await seedCourse(3);
  const answers = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [right] = await db
        .insert(questionOptions)
        .values([
          { questionId, orderNum: 1, text: t("R"), isCorrect: true },
          { questionId, orderNum: 2, text: t("F"), isCorrect: false },
        ])
        .returning();
      return { questionId, selectedOptionId: right.id };
    }),
  );
  const [section] = await db.insert(sections).values({ objectiveId: course.objectiveId, orderNum: 1, title: t("S") }).returning();
  const [objective] = await db.select().from(objectives).where(eq(objectives.id, course.objectiveId));
  const [domain] = await db.select().from(domains).where(eq(domains.id, objective.domainId));
  const userId = await seedUser();
  return { userId, sectionId: section.id, domainId: domain.id, answers, questionIds: course.questionIds };
}

/** Erzwingt einen Fehler beim Schreiben der Wiederholungen, dem letzten Schritt der Verbuchung (nach Versuch, Antworten und Lernzielstand). */
async function failOnReviewLog<T>(userId: string, fn: () => Promise<T>) {
  const db = getDb();
  const name = `fail_review_${userId.replaceAll("-", "")}`;
  await db.execute(sql.raw(`create function ${name}() returns trigger language plpgsql as $$ begin if new.user_id = '${userId}' then raise exception 'Abbruch (Test)'; end if; return new; end $$`));
  await db.execute(sql.raw(`create trigger ${name} before insert on review_log for each row execute function ${name}()`));
  try {
    return await fn();
  } finally {
    await db.execute(sql.raw(`drop trigger ${name} on review_log`));
    await db.execute(sql.raw(`drop function ${name}()`));
  }
}

const attemptsOf = async (userId: string) => getDb().select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
const logsOf = async (userId: string) => getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
const progressOf = async (userId: string) => getDb().select().from(objectiveProgress).where(eq(objectiveProgress.userId, userId));

run("Lektionstest und Kapitel-Quiz atomar (echte DB)", () => {
  it("Lektionstest: Fehler nach dem Verbuchen hinterlässt nichts, erneutes Senden verbucht jede Antwort genau einmal", async () => {
    const { userId, sectionId, answers, questionIds } = await setup();

    await failOnReviewLog(userId, async () => {
      await expect(recordSectionQuizAttempt(userId, sectionId, answers)).rejects.toThrow();
    });
    expect(await attemptsOf(userId)).toHaveLength(0);
    expect(await progressOf(userId)).toHaveLength(0);
    expect(await logsOf(userId)).toHaveLength(0);

    const result = await recordSectionQuizAttempt(userId, sectionId, answers);
    expect(result.score).toBe(100);
    const attempts = await attemptsOf(userId);
    expect(attempts).toHaveLength(1);
    expect(await getDb().select().from(quizAnswers).where(eq(quizAnswers.quizAttemptId, attempts[0].id))).toHaveLength(questionIds.length);
    const logs = await logsOf(userId);
    expect(logs).toHaveLength(questionIds.length);
    expect(new Set(logs.map((l) => l.itemId))).toEqual(new Set(questionIds));
    expect(await progressOf(userId)).toHaveLength(1);
  });

  it("Kapitel-Quiz: Fehler nach dem Verbuchen hinterlässt nichts, erneutes Senden verbucht jede Antwort genau einmal", async () => {
    const { userId, domainId, answers, questionIds } = await setup();

    await failOnReviewLog(userId, async () => {
      await expect(recordChapterQuizAttempt(userId, domainId, answers)).rejects.toThrow();
    });
    expect(await attemptsOf(userId)).toHaveLength(0);
    expect(await progressOf(userId)).toHaveLength(0);
    expect(await logsOf(userId)).toHaveLength(0);

    const result = await recordChapterQuizAttempt(userId, domainId, answers);
    expect(result.score).toBe(100);
    expect(await attemptsOf(userId)).toHaveLength(1);
    expect(await logsOf(userId)).toHaveLength(questionIds.length);
  });
});
