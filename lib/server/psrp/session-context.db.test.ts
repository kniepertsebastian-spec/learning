/** Aufgabe 16 (Review 12.11.2026): Lesezeit, Fehlerserien und Gerätegröße aus echten Daten und über die Routen (nur mit TEST_DATABASE_URL). */
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { getDb } from "@/lib/server/db/client";
import { learningExits, lessonReadingTime, questionOptions, quizAttempts, quizzes, reviewLog, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { exportAccountData } from "@/lib/server/account/export";
import { completeStudySession } from "@/lib/server/study/session-service";
import { processSyncEvents } from "@/lib/server/sync/service";
import { POST as lessonTime } from "@/app/api/lesson-time/route";
import { computeSessionContext } from "./session-context";
import { loadSessionContextUsers } from "./session-context-db";

const run = TEST_DB ? describe : describe.skip;
const asOf = new Date(Date.now() + 86_400_000);
const t = (v: string) => ({ de: v, en: v });
const post = (body: unknown) => lessonTime(new Request("http://x/api/lesson-time", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

async function setup(group: "planning" | null = "planning") {
  const db = getDb();
  const course = await seedCourse(3);
  const [sectionId] = await seedLessons(course.objectiveId, [Array.from({ length: 600 }, (_, i) => `wort${i}`).join(" ")]);
  const options = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [right] = await db.insert(questionOptions).values([{ questionId, orderNum: 1, text: t("R"), isCorrect: true }, { questionId, orderNum: 2, text: t("F"), isCorrect: false }]).returning();
      return right.id;
    }),
  );
  const userId = await seedUser();
  if (group) await db.update(users).set({ evaluationGroup: group }).where(eq(users.id, userId));
  authMock.mockResolvedValue({ user: { id: userId } });
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "in_progress", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  const answers = items.map((item, i) => ({ itemId: item.id, selectedOptionId: options[i] }));
  return { userId, sectionId, course, session, answers, options };
}

const readingOf = async (userId: string, sectionId: string) => (await getDb().select().from(lessonReadingTime).where(eq(lessonReadingTime.userId, userId)).limit(10)).find((r) => r.sectionId === sectionId);

run("Lesezeit je Lektion (echte DB)", () => {
  it("die Route addiert Sekunden, zählt das Öffnen und deckelt auf 24 Stunden", async () => {
    const { userId, sectionId } = await setup();
    expect((await post({ sectionId, seconds: 0, opened: true })).status).toBe(204);
    expect((await post({ sectionId, seconds: 60 })).status).toBe(204);
    expect((await post({ sectionId, seconds: 45, opened: true })).status).toBe(204);
    expect(await readingOf(userId, sectionId)).toMatchObject({ seconds: 105, opens: 2 });
    await getDb().update(lessonReadingTime).set({ seconds: 86_390 }).where(eq(lessonReadingTime.userId, userId));
    await post({ sectionId, seconds: 120 });
    expect((await readingOf(userId, sectionId))?.seconds).toBe(86_400);
  });

  it("ungültige Meldungen und unbekannte Lektionen speichern nichts", async () => {
    const { userId, sectionId } = await setup();
    expect((await post({ sectionId: "keine-uuid", seconds: 5 })).status).toBe(400);
    expect((await post({ sectionId, seconds: 500 })).status).toBe(400);
    expect((await post({ sectionId, seconds: -1 })).status).toBe(400);
    expect((await post({ sectionId: crypto.randomUUID(), seconds: 5 })).status).toBe(404);
    expect(await readingOf(userId, sectionId)).toBeUndefined();
    authMock.mockResolvedValue(null);
    expect((await post({ sectionId, seconds: 5 })).status).toBe(401);
  });

  it("mit abgeschaltetem Flag wird nichts gespeichert", async () => {
    const { userId, sectionId } = await setup();
    vi.stubEnv("FEATURE_READING_TIME", "0");
    try {
      expect((await post({ sectionId, seconds: 30, opened: true })).status).toBe(204);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await readingOf(userId, sectionId)).toBeUndefined();
  });

  it("die Lesezeit steht im Datenexport", async () => {
    const { userId, sectionId } = await setup();
    await post({ sectionId, seconds: 30, opened: true });
    const data = (await exportAccountData(userId))!;
    expect(data.learning.lessonReadingTime).toMatchObject([{ sectionId, seconds: 30, opens: 1 }]);
  });

  it("Auswertung: Lesezeit gegen Ergebnis des ersten Lektionstests", async () => {
    const { userId, sectionId, course } = await setup();
    const db = getDb();
    // 600 Wörter in 20 Sekunden: 1800 Wörter pro Minute, kaum gelesen.
    await post({ sectionId, seconds: 20, opened: true });
    const [quiz] = await db.insert(quizzes).values({ sectionId, certificationId: course.certId }).returning();
    await db.insert(quizAttempts).values([
      { quizId: quiz.id, userId, score: "40.00", completedAt: new Date(Date.now() - 2000) },
      { quizId: quiz.id, userId, score: "100.00", completedAt: new Date(Date.now() - 1000) },
    ]);
    const people = await loadSessionContextUsers(asOf);
    const mine = people.flatMap((p) => p.reading).find((r) => r.words === 600 && r.seconds === 20 && r.firstQuizScore === 40);
    expect(mine).toBeDefined();
    const m = computeSessionContext(people.filter((p) => p.reading.includes(mine!)));
    expect(m.reading.skimmed.numerator).toBe(1);
    expect(m.reading.firstQuizScore.skimmed).toMatchObject({ n: 1, meanScore: 40 });
  });
});

run("Gerätegröße der Sitzung (echte DB)", () => {
  it("wird beim Abschluss gespeichert, unbekannte Werte entfallen, bei ausgeschaltetem Flag wird nichts gespeichert", async () => {
    const a = await setup();
    await completeStudySession(a.session.id, a.userId, a.answers, { deviceClass: "narrow" });
    expect((await getDb().select().from(studySessions).where(eq(studySessions.id, a.session.id)))[0].deviceClass).toBe("narrow");

    const b = await setup();
    await completeStudySession(b.session.id, b.userId, b.answers, { deviceClass: "iPhone 15 Pro, 393x852" });
    expect((await getDb().select().from(studySessions).where(eq(studySessions.id, b.session.id)))[0].deviceClass).toBeNull();

    const c = await setup();
    vi.stubEnv("FEATURE_DEVICE_CLASS", "0");
    try {
      await completeStudySession(c.session.id, c.userId, c.answers, { deviceClass: "wide" });
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await getDb().select().from(studySessions).where(eq(studySessions.id, c.session.id)))[0].deviceClass).toBeNull();
  });

  it("aus der Sync-Warteschlange kommt die Klasse ebenfalls an", async () => {
    const a = await setup();
    const [result] = await processSyncEvents(a.userId, [
      { clientEventId: crypto.randomUUID(), type: "study_session", clientCreatedAt: new Date().toISOString(), payload: { sessionId: a.session.id, deviceClass: "wide", answers: a.answers } },
    ]);
    expect(result.status).toBe("applied");
    expect((await getDb().select().from(studySessions).where(eq(studySessions.id, a.session.id)))[0].deviceClass).toBe("wide");
  });

  it("Auswertung je Klasse mit Nenner; die Datenbank lehnt einen anderen Wert ab", async () => {
    const a = await setup();
    await completeStudySession(a.session.id, a.userId, a.answers, { deviceClass: "narrow" });
    const mine = (await loadSessionContextUsers(asOf)).filter((p) => p.deviceSessions.some((s) => s.answered === 3 && s.correct === 3 && s.deviceClass === "narrow"));
    expect(mine.length).toBeGreaterThanOrEqual(1);
    const bad = await getDb().update(studySessions).set({ deviceClass: "tablet" as never }).where(eq(studySessions.id, a.session.id)).then(() => null, (e: unknown) => e);
    expect(String((bad as { cause?: unknown })?.cause ?? bad)).toContain("study_sessions_device_class_check");
  });
});

run("Durchhalten nach Fehlern (echte DB)", () => {
  it("liest die Ratings je Sitzung in zeitlicher Reihenfolge und den Notausstieg", async () => {
    const { userId, course, session } = await setup();
    const db = getDb();
    const at = (s: number) => new Date(Date.now() - 100_000 + s * 1000);
    await db.insert(reviewLog).values(
      [3, 1, 1, 1].map((rating, i) => ({ userId, itemId: course.questionIds[i % 3], sessionId: session.id, timestampUtc: at(i), localHour: 9, weekday: 1, rawRating: rating })),
    );
    await db.insert(learningExits).values({ userId, source: "session", sessionId: session.id });
    const people = await loadSessionContextUsers(asOf);
    const mine = people.flatMap((p) => p.sessions).find((s) => s.ratings.join() === "3,1,1,1");
    expect(mine).toEqual({ ratings: [3, 1, 1, 1], exited: true });
    expect(computeSessionContext(people.filter((p) => p.sessions.includes(mine!))).persistence.exited.numerator).toBe(1);
  });
});
