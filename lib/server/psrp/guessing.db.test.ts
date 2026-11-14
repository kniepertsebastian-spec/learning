/** Aufgabe 13 (Review 12.11.2026): changedAnswer an Sitzungs- und Testantworten, Gewichtung hinter dem Flag (nur mit TEST_DATABASE_URL). */
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, quizAnswers, reviewLog, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { studySessionAttemptBody } from "@/lib/server/http/attempt-body";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { completeStudySession, getStudySessionDraft, pauseStudySession } from "@/lib/server/study/session-service";
import { seedCourse, seedLessons, seedUser } from "./test-db";
import { STABLE_BASE_MIN_N } from "./guessing";
import { itemBaseTimes, loadGuessingUsers } from "./guessing-db";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });

async function setup(count: number) {
  const db = getDb();
  const course = await seedCourse(count);
  const options = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const rows = await db.insert(questionOptions).values([{ questionId, orderNum: 1, text: t("R"), isCorrect: true }, { questionId, orderNum: 2, text: t("F"), isCorrect: false }]).returning();
      return { right: rows[0].id, wrong: rows[1].id };
    }),
  );
  const userId = await seedUser();
  await db.update(users).set({ evaluationGroup: "planning" }).where(eq(users.id, userId));
  return { ...course, options, userId };
}

async function openSession(s: Awaited<ReturnType<typeof setup>>) {
  const db = getDb();
  const [session] = await db.insert(studySessions).values({ userId: s.userId, certificationId: s.certId, status: "in_progress", goalType: "questions", goalValue: s.questionIds.length, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(s.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { sessionId: session.id, items };
}

/** Basiszeit für jede Frage: `STABLE_BASE_MIN_N` Antworten zu 6 s von anderen Personen. */
async function seedBaseTimes(questionIds: string[]) {
  const other = await seedUser();
  await getDb().insert(reviewLog).values(
    questionIds.flatMap((itemId) => Array.from({ length: STABLE_BASE_MIN_N }, () => ({ userId: other, itemId, sessionId: crypto.randomUUID(), localHour: 10, weekday: 2, rawRating: 3, responseTimeMs: 6000 }))),
  );
}

afterEach(() => {
  delete process.env.FEATURE_GUESS_WEIGHTING;
});

run("Raten und Unsicherheit (echte DB)", () => {
  it("Akzeptanz: changedAnswer ist für neue Antworten gefüllt (Sitzung, Pause, Lektionstest); ältere Clients lassen es leer", async () => {
    const s = await setup(3);
    const a = await openSession(s);
    await pauseStudySession(a.sessionId, s.userId, { answers: [{ itemId: a.items[0].id, selectedOptionId: s.options[0].right, changedAnswer: true }], currentIndex: 1 });
    expect((await getStudySessionDraft(a.sessionId, s.userId))?.answers[0].changedAnswer).toBe(true);
    const body = studySessionAttemptBody.parse({
      answers: [
        { itemId: a.items[0].id, selectedOptionId: s.options[0].right, changedAnswer: true },
        { itemId: a.items[1].id, selectedOptionId: s.options[1].wrong, changedAnswer: false },
        { itemId: a.items[2].id, selectedOptionId: s.options[2].right, changedAnswer: "ja" },
      ],
    });
    await completeStudySession(a.sessionId, s.userId, body.answers);
    const items = await getDb().select().from(studySessionItems).where(eq(studySessionItems.sessionId, a.sessionId));
    expect(Object.fromEntries(items.map((i) => [i.orderNum, i.changedAnswer]))).toEqual({ 0: true, 1: false, 2: null });

    const [sectionId] = await seedLessons(s.objectiveId, ["Inhalt"]);
    await recordSectionQuizAttempt(s.userId, sectionId, [{ questionId: s.questionIds[0], selectedOptionId: s.options[0].right, changedAnswer: false, responseTimeMs: 2500 }]);
    const [qa] = await getDb().select().from(quizAnswers).where(eq(quizAnswers.questionId, s.questionIds[0]));
    expect(qa).toMatchObject({ changedAnswer: false, responseTimeMs: 2500 });

    // Export: geänderte Antworten mit Nenner
    const person = (await loadGuessingUsers(new Date(Date.now() + 60_000))).find((p) => p.answers.length === 3 && p.answers.some((x) => x.changed));
    expect(person?.answers).toEqual(expect.arrayContaining([{ changed: true, correct: true }, { changed: false, correct: false }, { changed: false, correct: true }]));
  });

  it("Durchklicken im Export: nur bei stabiler Basiszeit beurteilt", async () => {
    const s = await setup(2);
    await seedBaseTimes([s.questionIds[0]]);
    const a = await openSession(s);
    await completeStudySession(a.sessionId, s.userId, [
      { itemId: a.items[0].id, selectedOptionId: s.options[0].wrong, responseTimeMs: 900 },
      { itemId: a.items[1].id, selectedOptionId: s.options[1].right, responseTimeMs: 900 },
    ]);
    const bases = await itemBaseTimes(s.questionIds);
    expect(bases.get(s.questionIds[0])).toMatchObject({ n: STABLE_BASE_MIN_N + 1 });
    const person = (await loadGuessingUsers(new Date(Date.now() + 60_000))).find((p) => p.reviews.some((r) => r.sessionId === a.sessionId));
    expect(person?.reviews.map((r) => r.rushed).sort()).toEqual([null, true].sort());
  });

  it("Gewichtung im Lernzielstand nur mit Flag guess_weighting (standardmäßig aus)", async () => {
    const s = await setup(2);
    await seedBaseTimes(s.questionIds);
    const [sectionId] = await seedLessons(s.objectiveId, ["Inhalt"]);
    // Älterer Versuch: falsch in normaler Zeit (Gewicht 0,75). Neuerer: richtig, aber durchgeklickt (1 s bei 6 s Basiszeit, Gewicht 1).
    await recordSectionQuizAttempt(s.userId, sectionId, [{ questionId: s.questionIds[1], selectedOptionId: s.options[1].wrong, responseTimeMs: 6000 }]);
    await new Promise((r) => setTimeout(r, 20));
    await recordSectionQuizAttempt(s.userId, sectionId, [{ questionId: s.questionIds[0], selectedOptionId: s.options[0].right, responseTimeMs: 1000 }]);
    const off = await ObjectiveProgressService.calculateObjectiveMastery(s.userId, s.objectiveId);
    process.env.FEATURE_GUESS_WEIGHTING = "1";
    const on = await ObjectiveProgressService.calculateObjectiveMastery(s.userId, s.objectiveId);
    expect(off.masteryScore).toBe(57); // 1 / 1,75
    expect(on.masteryScore).toBe(40); // 0,5 / 1,25
    expect(on.correctCount).toBe(off.correctCount);
  });
});
