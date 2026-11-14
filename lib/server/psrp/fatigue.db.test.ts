/** Aufgabe 12 (Review 12.11.2026): Ermüdung nach Position und Unterbrechungen je Sitzung aus echten Daten (nur mit TEST_DATABASE_URL). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { getDb } from "@/lib/server/db/client";
import { questionOptions, studySessionItems, studySessions, users } from "@/lib/server/db/schema";
import { exportAccountData } from "@/lib/server/account/export";
import { completeStudySession, getStudySessionDraft, pauseStudySession } from "@/lib/server/study/session-service";
import { processSyncEvents } from "@/lib/server/sync/service";
import { POST as attemptRoute } from "@/app/api/study-sessions/[sessionId]/attempt/route";
import { seedCourse, seedUser } from "./test-db";
import { computeFatigue } from "./fatigue";
import { fatigueMetrics, loadFatigueSessions, personalFatigueStatements } from "./fatigue-db";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const asOf = () => new Date(Date.now() + 60_000);

/** Kurs mit `count` Fragen (je eine richtige und eine falsche Option) und eine Person in der Gruppe „planning“. */
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
  authMock.mockResolvedValue({ user: { id: userId } });
  return { ...course, options, userId };
}

/** Neue offene Sitzung über alle Fragen in fester Reihenfolge. */
async function openSession(s: Awaited<ReturnType<typeof setup>>) {
  const db = getDb();
  const [session] = await db.insert(studySessions).values({ userId: s.userId, certificationId: s.certId, status: "in_progress", goalType: "questions", goalValue: s.questionIds.length, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(s.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  return { sessionId: session.id, items };
}

const sessionRow = async (id: string) => (await getDb().select().from(studySessions).where(eq(studySessions.id, id)))[0];

afterEach(() => {
  delete process.env.FEATURE_INTERRUPTIONS;
});

run("Ermüdung und Unterbrechungen (echte DB)", () => {
  it("Akzeptanz: Person mit 200 Reviews, Werte aus 4.1 mit Nenner und Unterbrechungen je Sitzung", async () => {
    const s = await setup(10);
    for (let k = 0; k < 20; k++) {
      const { sessionId, items } = await openSession(s);
      // Die letzten drei Fragen jeder Sitzung falsch und langsamer.
      await completeStudySession(
        sessionId,
        s.userId,
        items.map((item, i) => ({ itemId: item.id, selectedOptionId: i < 7 ? s.options[i].right : s.options[i].wrong, responseTimeMs: i < 7 ? 4000 : 8000 })),
        { interruptions: k % 2 ? { count: 2, totalMs: 30_000 } : { count: 0, totalMs: 0 } },
      );
    }
    const sessions = (await loadFatigueSessions([s.userId], asOf())).get(s.userId)!;
    expect(sessions).toHaveLength(20);
    const f = computeFatigue(sessions);
    expect(f.answers).toBe(200);
    expect(f.thirds.first.errors).toMatchObject({ numerator: 0, n: 80, small: false });
    expect(f.thirds.third.errors).toMatchObject({ numerator: 60, n: 60 });
    expect(f.thirds.third.medianResponseMs).toBe(8000);
    expect(f.thirds.first.timed).toBe(80);
    expect(f.interruptions).toMatchObject({ measured: 20, medianCount: 2, medianSeconds: 30 });
    expect(f.interruptions.interrupted).toMatchObject({ numerator: 10, n: 20 });

    // Der Export enthält den Abschnitt mit Nenner (gesamt und je Gruppe).
    const metrics = await fatigueMetrics(asOf());
    expect(metrics.all.thirds.first.errors.n).toBeGreaterThanOrEqual(80);
    expect(metrics.byGroup.planning?.interruptions.measured).toBeGreaterThanOrEqual(20);

    // Für die Person nur Aussagen: nach etwa 7 von 10 Fragen mehr Fehler, langsamer, oft unterbrochen.
    expect(await personalFatigueStatements(s.userId)).toEqual([
      { kind: "more_errors_after", afterQuestions: 7 },
      { kind: "slower_towards_end" },
      { kind: "often_interrupted", interrupted: 10, measured: 20 },
    ]);

    // Datenexport der Person enthält die Werte je Sitzung.
    const data = await exportAccountData(s.userId);
    const exported = (data as { learning: { studySessions: Array<{ interruptionCount: number | null; interruptionMs: number | null }> } }).learning.studySessions;
    expect(exported.filter((x) => x.interruptionCount === 2 && x.interruptionMs === 30_000)).toHaveLength(10);
  });

  it("Route, Pause und Sync speichern die Unterbrechungen; unbrauchbare Werte und Flag aus speichern nichts", async () => {
    const s = await setup(3);
    const answers = (items: { id: string }[]) => items.map((item, i) => ({ itemId: item.id, selectedOptionId: s.options[i].right }));

    // Route: gültiger Wert
    const a = await openSession(s);
    const res = await attemptRoute(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: answers(a.items), interruptions: { count: 1, totalMs: 4500 } }) }) as unknown as NextRequest, { params: Promise.resolve({ sessionId: a.sessionId }) });
    expect(res.status).toBe(200);
    expect(await sessionRow(a.sessionId)).toMatchObject({ status: "completed", interruptionCount: 1, interruptionMs: 4500 });

    // Route: kaputter Wert kostet nicht die Abgabe
    const b = await openSession(s);
    const broken = await attemptRoute(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: answers(b.items), interruptions: { count: "viele" } }) }) as unknown as NextRequest, { params: Promise.resolve({ sessionId: b.sessionId }) });
    expect(broken.status).toBe(200);
    expect(await sessionRow(b.sessionId)).toMatchObject({ status: "completed", interruptionCount: null, interruptionMs: null });

    // Pause: Stand im Zwischenstand, Abschluss mit dem weitergezählten Wert
    const c = await openSession(s);
    await pauseStudySession(c.sessionId, s.userId, { answers: answers(c.items).slice(0, 1), currentIndex: 1, interruptions: { count: 2, totalMs: 9000 } });
    expect((await getStudySessionDraft(c.sessionId, s.userId))?.interruptions).toEqual({ count: 2, totalMs: 9000 });
    await completeStudySession(c.sessionId, s.userId, answers(c.items), { interruptions: { count: 3, totalMs: 12_000 } });
    expect(await sessionRow(c.sessionId)).toMatchObject({ interruptionCount: 3, interruptionMs: 12_000 });

    // Sync-Warteschlange eines Offline-Geräts
    const d = await openSession(s);
    const [synced] = await processSyncEvents(s.userId, [{ clientEventId: `int-${d.sessionId}`, type: "study_session", clientCreatedAt: new Date().toISOString(), payload: { sessionId: d.sessionId, answers: answers(d.items), interruptions: { count: 0, totalMs: 0 } } }]);
    expect(synced.status).toBe("applied");
    expect(await sessionRow(d.sessionId)).toMatchObject({ interruptionCount: 0, interruptionMs: 0 });

    // Flag aus: nichts gespeichert, auch nicht im Zwischenstand
    process.env.FEATURE_INTERRUPTIONS = "0";
    const e = await openSession(s);
    await pauseStudySession(e.sessionId, s.userId, { answers: [], currentIndex: 0, interruptions: { count: 1, totalMs: 3000 } });
    expect((await getStudySessionDraft(e.sessionId, s.userId))?.interruptions).toBeUndefined();
    await completeStudySession(e.sessionId, s.userId, answers(e.items), { interruptions: { count: 1, totalMs: 3000 } });
    expect(await sessionRow(e.sessionId)).toMatchObject({ status: "completed", interruptionCount: null });
  });

  it("zu wenige Sitzungen: keine Aussage für die Person", async () => {
    const s = await setup(3);
    const { sessionId, items } = await openSession(s);
    await completeStudySession(sessionId, s.userId, items.map((item, i) => ({ itemId: item.id, selectedOptionId: s.options[i].wrong, responseTimeMs: 9000 })), { interruptions: { count: 1, totalMs: 5000 } });
    expect(await personalFatigueStatements(s.userId)).toEqual([]);
  });
});
