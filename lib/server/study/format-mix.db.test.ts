/** Session-Mix für Fragen mit neuem Antwortformat (höchstens 20 %) gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questions, studySessionItems } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { startStudySession } from "./session-service";

const run = TEST_DB ? describe : describe.skip;

async function formatShare(sessionId: string) {
  const db = getDb();
  const items = await db.select({ ref: studySessionItems.referenceId }).from(studySessionItems).where(eq(studySessionItems.sessionId, sessionId));
  const rows = items.length ? await db.select({ format: questions.answerFormat }).from(questions).where(inArray(questions.id, items.map((i) => i.ref))) : [];
  return { total: rows.length, format: rows.filter((r) => r.format !== "choice").length };
}

run("Session-Mix mit Formatfragen (echte DB)", () => {
  it("höchstens 20 % der Fragen haben ein neues Format, wenn genug Auswahlfragen da sind", async () => {
    const course = await seedCourse(15);
    const userId = await seedUser();
    // Fünf der 15 Fragen werden zu Kurzantworten.
    await Promise.all(course.questionIds.slice(0, 5).map((id) => getDb().update(questions).set({ answerFormat: "short_answer", answerData: { accepted: ["x"] } }).where(eq(questions.id, id))));
    const session = await startStudySession(userId, course.certId, 10, "questions");
    const share = await formatShare(session.id);
    expect(share.total).toBeGreaterThanOrEqual(10);
    expect(share.format).toBeGreaterThan(0);
    expect(share.format).toBeLessThanOrEqual(Math.floor(share.total * 0.2));
  });

  it("ein Kurs nur mit Formatfragen bleibt nicht leer", async () => {
    const course = await seedCourse(4);
    const userId = await seedUser();
    await Promise.all(course.questionIds.map((id) => getDb().update(questions).set({ answerFormat: "short_answer", answerData: { accepted: ["x"] } }).where(eq(questions.id, id))));
    const session = await startStudySession(userId, course.certId, 4, "questions");
    expect((await formatShare(session.id)).format).toBe(4);
  });
});
