/** „Pause für heute“ gegen echte DB: Antworten bleiben erhalten, die Session geht später weiter. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { completeStudySession, getStudySessionDraft, pauseStudySession, peekActiveOrTodaySession, StudySessionNotFoundError } from "./session-service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup(count = 3) {
  const course = await seedCourse(count);
  const right: string[] = [];
  for (const q of course.questionIds) {
    const [o] = await getDb().insert(questionOptions).values([
      { questionId: q, orderNum: 1, text: t("R"), isCorrect: true },
      { questionId: q, orderNum: 2, text: t("F"), isCorrect: false },
    ]).returning();
    right.push(o.id);
  }
  const userId = await seedUser();
  const [session] = await getDb().insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await getDb().insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { course, right, userId, session, items };
}

run("Pause für heute (echte DB)", () => {
  it("speichert Antworten und Position, ohne Reviews zu schreiben; die Session bleibt aktiv", async () => {
    const { right, userId, session, items, course } = await setup();
    const result = await pauseStudySession(session.id, userId, {
      currentIndex: 2,
      answers: [
        { itemId: items[0].id, selectedOptionId: right[0], confidence: "sure" },
        { itemId: items[1].id, selectedOptionId: right[1] },
        { itemId: crypto.randomUUID(), selectedOptionId: "fremd" }, // gehört nicht zur Session
      ],
    });
    expect(result.answered).toBe(2);
    const [row] = await getDb().select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(row.status).toBe("in_progress");
    expect(row.pausedAt).not.toBeNull();
    expect(await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).toHaveLength(0);
    const draft = await getStudySessionDraft(session.id, userId);
    expect(draft?.currentIndex).toBe(2);
    expect(draft?.answers.map((a) => a.itemId)).toEqual([items[0].id, items[1].id]);
    expect(draft?.answers[0].confidence).toBe("sure");

    // Tage später ist es noch dieselbe Session, mit Hinweis auf die gespeicherten Antworten.
    const later = await peekActiveOrTodaySession(userId, course.certId, new Date(Date.now() + 3 * 86_400_000));
    expect(later?.id).toBe(session.id);
    expect(later?.paused).toEqual({ answered: 2 });
  });

  it("fremde Personen können nicht pausieren; eine abgeschlossene Session lässt sich nicht pausieren", async () => {
    const { right, userId, session, items } = await setup(1);
    const other = await seedUser();
    await expect(pauseStudySession(session.id, other, { answers: [], currentIndex: 0 })).rejects.toBeInstanceOf(StudySessionNotFoundError);
    await completeStudySession(session.id, userId, [{ itemId: items[0].id, selectedOptionId: right[0] }]);
    await expect(pauseStudySession(session.id, userId, { answers: [], currentIndex: 0 })).rejects.toThrow();
    expect(await getStudySessionDraft(session.id, userId)).toBeNull();
  });

  it("der Abschluss räumt den Zwischenstand weg", async () => {
    const { right, userId, session, items } = await setup(2);
    await pauseStudySession(session.id, userId, { currentIndex: 1, answers: [{ itemId: items[0].id, selectedOptionId: right[0] }] });
    await completeStudySession(session.id, userId, items.map((item, i) => ({ itemId: item.id, selectedOptionId: right[i] })));
    const [row] = await getDb().select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(row).toMatchObject({ status: "completed", draft: null, pausedAt: null });
    expect(await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).toHaveLength(2);
  });
});
