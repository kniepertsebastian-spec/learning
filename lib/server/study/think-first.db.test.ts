/** „Antwort zuerst überlegen“ wird am Review vermerkt (nur Auswertung) gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { completeStudySession } from "./session-service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function withOptions(questionId: string) {
  const [right] = await getDb().insert(questionOptions).values([
    { questionId, orderNum: 1, text: t("R"), isCorrect: true },
    { questionId, orderNum: 2, text: t("F"), isCorrect: false },
  ]).returning();
  return right.id;
}

run("Antwort zuerst überlegen (echte DB)", () => {
  it("Session: nur Antworten mit dem Vermerk bekommen think_first; das Rating bleibt gleich", async () => {
    const course = await seedCourse(2);
    const userId = await seedUser();
    const right = await Promise.all(course.questionIds.map(withOptions));
    const db = getDb();
    const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
    const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
    await completeStudySession(session.id, userId, [
      { itemId: items[0].id, selectedOptionId: right[0], thinkFirst: true },
      { itemId: items[1].id, selectedOptionId: right[1] },
    ]);
    const logs = await db.select().from(reviewLog).where(eq(reviewLog.userId, userId));
    const byItem = new Map(logs.map((l) => [l.itemId, l]));
    expect(byItem.get(course.questionIds[0])?.thinkFirst).toBe(true);
    expect(byItem.get(course.questionIds[1])?.thinkFirst).toBe(false);
    expect(byItem.get(course.questionIds[0])?.rawRating).toBe(byItem.get(course.questionIds[1])?.rawRating);
  });

  it("Lektionstest: der Vermerk landet im Review-Log", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    const right = await withOptions(course.questionIds[0]);
    const [sectionId] = await seedLessons(course.objectiveId, ["Text"]);
    await recordSectionQuizAttempt(userId, sectionId, [{ questionId: course.questionIds[0], selectedOptionId: right, thinkFirst: true }]);
    const [log] = await getDb().select().from(reviewLog).where(and(eq(reviewLog.userId, userId), eq(reviewLog.itemId, course.questionIds[0])));
    expect(log.thinkFirst).toBe(true);
  });
});
