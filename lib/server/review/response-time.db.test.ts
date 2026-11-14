/** Aufgabe 06b (Review 12.11.2026): Antwortzeit kommt in review_log an, die drei Verbraucher bekommen Daten. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { examQuestions, exams, questionOptions, reviewLog, studySessionItems, studySessions } from "@/lib/server/db/schema";
import { collectEngagementFacts } from "@/lib/server/engagement/service";
import { detectEngagementSignals } from "@/lib/server/engagement/rules";
import { submitExamAttempt } from "@/lib/server/exam/attempt";
import { studySessionAttemptBody } from "@/lib/server/http/attempt-body";
import { DEFAULT_PSRP_CONFIG } from "@/lib/server/psrp/config";
import { averageSecondsPerReview } from "@/lib/server/psrp/planning-service";
import { getItemBaseTimeMs } from "@/lib/server/psrp/review-log";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { recordSectionQuizAttempt } from "@/lib/server/sections/attempt-service";
import { completeStudySession, getStudySessionDraft, pauseStudySession } from "@/lib/server/study/session-service";
import { processSyncEvents } from "@/lib/server/sync/service";
import { recordReviewOutcomes } from "./service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const DAY = 86_400_000;

/** Kurs mit `count` Fragen (je eine richtige Option), Person und offene Session über alle Fragen. */
async function setup(count: number) {
  const db = getDb();
  const course = await seedCourse(count);
  const right = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [r] = await db.insert(questionOptions).values([{ questionId, orderNum: 1, text: t("R"), isCorrect: true }, { questionId, orderNum: 2, text: t("F"), isCorrect: false }]).returning();
      return r.id;
    }),
  );
  const userId = await seedUser();
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "in_progress", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { ...course, right, userId, sessionId: session.id, items };
}

const timesOf = async (userId: string) => {
  const rows = await getDb().select({ itemId: reviewLog.itemId, ms: reviewLog.responseTimeMs }).from(reviewLog).where(eq(reviewLog.userId, userId));
  return new Map(rows.map((r) => [r.itemId, r.ms]));
};

run("Antwortzeit auf dem Server (echte DB)", () => {
  it("Akzeptanz: nach zehn beantworteten Fragen liefert averageSecondsPerReview einen Wert", async () => {
    const s = await setup(10);
    expect(await averageSecondsPerReview(s.userId)).toBeNull();
    // Wie die Route: Body durch das Schema, dann abschließen.
    const body = studySessionAttemptBody.parse({ answers: s.items.map((item, i) => ({ itemId: item.id, selectedOptionId: s.right[i], responseTimeMs: 4000 + i * 200 })) });
    await completeStudySession(s.sessionId, s.userId, body.answers);

    const times = await timesOf(s.userId);
    expect(s.questionIds.map((q) => times.get(q))).toEqual(s.questionIds.map((_, i) => 4000 + i * 200));
    const avg = await averageSecondsPerReview(s.userId);
    expect(avg).not.toBeNull();
    expect(avg).toBeCloseTo(4.9 + DEFAULT_PSRP_CONFIG.planning.feedbackSecondsPerReview, 5);
  });

  it("unter 300 ms, über 10 Minuten oder fehlend: null, die Antwort zählt trotzdem", async () => {
    const s = await setup(4);
    const raw = [150, 700_000, undefined, 2500];
    await completeStudySession(s.sessionId, s.userId, s.items.map((item, i) => ({ itemId: item.id, selectedOptionId: s.right[i], ...(raw[i] !== undefined ? { responseTimeMs: raw[i] } : {}) })));
    const times = await timesOf(s.userId);
    expect(times.size).toBe(4);
    expect(s.questionIds.map((q) => times.get(q))).toEqual([null, null, null, 2500]);
  });

  it("Lektionstest, Prüfung und Sync-Ereignis reichen die Zeit durch", async () => {
    const db = getDb();
    // Lektionstest
    const a = await setup(2);
    const [sectionId] = await seedLessons(a.objectiveId, ["Inhalt"]);
    await recordSectionQuizAttempt(a.userId, sectionId, a.questionIds.map((questionId, i) => ({ questionId, selectedOptionId: a.right[i], responseTimeMs: 1800 + i })));
    expect([...(await timesOf(a.userId)).values()].sort()).toEqual([1800, 1801]);

    // Prüfung
    const b = await setup(3);
    const [exam] = await db.insert(exams).values({ certificationId: b.certId, blueprint: {} }).returning();
    await db.insert(examQuestions).values(b.questionIds.map((questionId, i) => ({ examId: exam.id, questionId, orderNum: i })));
    await submitExamAttempt(b.userId, exam.id, { answers: b.questionIds.map((questionId, i) => ({ questionId, selectedOptionId: i === 2 ? "" : b.right[i], ...(i === 2 ? {} : { responseTimeMs: 3000 + i }) })) });
    const examTimes = await timesOf(b.userId);
    expect(b.questionIds.map((q) => examTimes.get(q))).toEqual([3000, 3001, null]);

    // Sync-Ereignis (ungeprüfte Nutzlast eines Offline-Geräts, auch mit kaputtem Wert)
    const c = await setup(3);
    const results = await processSyncEvents(c.userId, [
      {
        clientEventId: `rt-${c.sessionId}`,
        type: "study_session",
        clientCreatedAt: new Date().toISOString(),
        payload: { sessionId: c.sessionId, answers: c.items.map((item, i) => ({ itemId: item.id, selectedOptionId: c.right[i], responseTimeMs: [5000, "5000", 100][i] })) },
      },
    ]);
    expect(results[0].status).toBe("applied");
    const syncTimes = await timesOf(c.userId);
    expect(c.questionIds.map((q) => syncTimes.get(q))).toEqual([5000, null, null]);
  });

  it("Pause: die bisher gemessene Zeit steht im Zwischenstand und geht beim Abschluss in review_log", async () => {
    const s = await setup(2);
    await pauseStudySession(s.sessionId, s.userId, { answers: [{ itemId: s.items[0].id, selectedOptionId: s.right[0], responseTimeMs: 2200 }, { itemId: s.items[1].id, selectedOptionId: s.right[1], responseTimeMs: "x" as never }], currentIndex: 1 });
    const draft = await getStudySessionDraft(s.sessionId, s.userId);
    expect(draft?.answers.map((a) => a.responseTimeMs)).toEqual([2200, undefined]);
    // Der Client setzt fort und schickt die (weitergezählten) Zeiten mit.
    await completeStudySession(s.sessionId, s.userId, s.items.map((item, i) => ({ itemId: item.id, selectedOptionId: s.right[i], responseTimeMs: [2600, 1900][i] })));
    const times = await timesOf(s.userId);
    expect(s.questionIds.map((q) => times.get(q))).toEqual([2600, 1900]);
  });

  it("Verbraucher: Basiszeit je Frage und das Signal slow_answers bekommen Daten", async () => {
    const s = await setup(30);
    const now = new Date();
    // Persönlicher Maßstab vor dem Beobachtungsfenster: 30 Antworten zu je 4 s.
    await recordReviewOutcomes(s.userId, s.questionIds.map((questionId, i) => ({ questionId, isCorrect: true, responseTimeMs: 4000, at: new Date(now.getTime() - 20 * DAY + i * 1000) })));
    expect(await getItemBaseTimeMs(s.questionIds[0])).toBe(4000);

    // Im Fenster: zehn Antworten zu je 9 s (mehr als das 1,5-Fache).
    await completeStudySession(s.sessionId, s.userId, s.items.slice(0, 10).map((item, i) => ({ itemId: item.id, selectedOptionId: s.right[i], responseTimeMs: 9000 })));
    const facts = await collectEngagementFacts(s.userId, now);
    expect(facts.window.filter((r) => r.responseTimeMs !== null)).toHaveLength(10);
    expect(facts.baseline.filter((r) => r.responseTimeMs !== null)).toHaveLength(30);
    expect(detectEngagementSignals(facts, now).map((signal) => signal.kind)).toContain("slow_answers");
    expect(await getItemBaseTimeMs(s.questionIds[0])).toBe(6500);
  });
});
