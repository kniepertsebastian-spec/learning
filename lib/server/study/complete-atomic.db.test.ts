/** Aufgabe 03a (Review 12.11.2026): completeStudySession in einer Transaktion, jede Antwort genau einmal in review_log. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { itemStates, questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { completeStudySession, StudySessionNotActiveError } from "./session-service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup(questionCount = 3) {
  const db = getDb();
  const course = await seedCourse(questionCount);
  const rightOptions = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [right] = await db.insert(questionOptions).values([
        { questionId, orderNum: 1, text: t("R"), isCorrect: true },
        { questionId, orderNum: 2, text: t("F"), isCorrect: false },
      ]).returning();
      return right.id;
    }),
  );
  const userId = await seedUser();
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "in_progress", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  const answers = items.map((item, i) => ({ itemId: item.id, selectedOptionId: rightOptions[i] }));
  return { userId, session, items, answers, questionIds: course.questionIds };
}

const logsOf = async (userId: string) => getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));

run("completeStudySession atomar (echte DB)", () => {
  it("Fehler nach dem Verbuchen: nichts bleibt stehen, erneutes Senden verbucht jede Antwort genau einmal", async () => {
    const { userId, session, answers, questionIds } = await setup();
    const db = getDb();
    const fn = `fail_complete_${session.id.replaceAll("-", "")}`;
    // Erzwingt den Fehler beim letzten Schritt (Status `completed`), also nach dem Verbuchen der Wiederholungen.
    await db.execute(sql.raw(`create function ${fn}() returns trigger language plpgsql as $$ begin if new.id = '${session.id}' and new.status = 'completed' then raise exception 'Abbruch (Test)'; end if; return new; end $$`));
    await db.execute(sql.raw(`create trigger ${fn} before update on study_sessions for each row execute function ${fn}()`));
    try {
      await expect(completeStudySession(session.id, userId, answers)).rejects.toThrow();
    } finally {
      await db.execute(sql.raw(`drop trigger ${fn} on study_sessions`));
      await db.execute(sql.raw(`drop function ${fn}()`));
    }
    expect(await logsOf(userId)).toHaveLength(0);
    expect(await db.select().from(itemStates).where(eq(itemStates.userId, userId))).toHaveLength(0);
    const [open] = await db.select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(open.status).toBe("in_progress");
    expect((await db.select().from(studySessionItems).where(eq(studySessionItems.sessionId, session.id))).every((i) => i.outcome === null)).toBe(true);

    const result = await completeStudySession(session.id, userId, answers);
    expect(result.score).toBe(100);
    const logs = await logsOf(userId);
    expect(logs).toHaveLength(questionIds.length);
    expect(new Set(logs.map((l) => l.itemId))).toEqual(new Set(questionIds));
    const [done] = await db.select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(done.status).toBe("completed");
  });

  it("zwei gleichzeitige Abgaben derselben Session: eine verbucht, die andere wird abgelehnt", async () => {
    const { userId, session, answers, questionIds } = await setup();
    const outcomes = await Promise.allSettled([
      completeStudySession(session.id, userId, answers),
      completeStudySession(session.id, userId, answers),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StudySessionNotActiveError);
    expect(await logsOf(userId)).toHaveLength(questionIds.length);
  });

  it("Sync-Pfad nach dem Abschluss: schon verbuchte Fragen der Session werden nicht erneut verbucht, offene schon", async () => {
    const { userId, session, answers, questionIds } = await setup();
    // Online abgeschlossen mit den ersten beiden Antworten.
    await completeStudySession(session.id, userId, answers.slice(0, 2));
    expect(await logsOf(userId)).toHaveLength(2);
    // Das Gerät sendet alle drei Antworten derselben Session noch einmal.
    const result = await completeStudySession(session.id, userId, answers, { countIfFinished: true });
    expect(result.partial).toBe(true);
    expect(result.results).toHaveLength(3);
    const logs = await logsOf(userId);
    expect(logs).toHaveLength(3);
    expect(new Set(logs.map((l) => l.itemId))).toEqual(new Set(questionIds));
    // Ein weiteres Senden ändert nichts mehr.
    await completeStudySession(session.id, userId, answers, { countIfFinished: true });
    expect(await logsOf(userId)).toHaveLength(3);
  });
});
