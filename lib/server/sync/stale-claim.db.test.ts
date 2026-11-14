/** Aufgabe 02a (Review 12.11.2026): verwaiste Sync-Claims erkennen und neu verarbeiten. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { questionOptions, reviewLog, studySessionItems, studySessions, syncEvents } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { processSyncEvents, STALE_CLAIM_MS, type SyncEventInput } from "./service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const PROCESSING = "wird verarbeitet";

/** Kurs mit zwei Fragen, offene Session und ein passendes study_session-Ereignis. */
async function setup() {
  const db = getDb();
  const course = await seedCourse(2);
  const options = await Promise.all(
    course.questionIds.map(async (questionId) => {
      const [right] = await db.insert(questionOptions).values([
        { questionId, orderNum: 1, text: t("R"), isCorrect: true },
        { questionId, orderNum: 2, text: t("F"), isCorrect: false },
      ]).returning();
      return right.id;
    }),
  );
  const userId = await seedUser();
  const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "planned", goalType: "minutes", goalValue: 10, plannedAt: new Date() }).returning();
  const items = await db.insert(studySessionItems).values(course.questionIds.map((id, i) => ({ sessionId: session.id, orderNum: i, category: "new" as const, referenceType: "question" as const, referenceId: id }))).returning();
  const event: SyncEventInput = {
    clientEventId: crypto.randomUUID(),
    type: "study_session",
    clientCreatedAt: new Date().toISOString(),
    payload: { sessionId: session.id, answers: items.map((item, i) => ({ itemId: item.id, selectedOptionId: options[i] })) },
  };
  return { userId, session, event };
}

/** So bleibt eine Claim-Zeile zurück, wenn der Prozess während der Verbuchung beendet wird. */
async function orphanClaim(userId: string, event: SyncEventInput, ageMs: number) {
  await getDb().insert(syncEvents).values({ userId, clientEventId: event.clientEventId, type: event.type, status: "error", errorMessage: PROCESSING, clientCreatedAt: new Date(event.clientCreatedAt), createdAt: new Date(Date.now() - ageMs) });
}

const logCount = async (userId: string) => (await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId))).length;

run("Verwaiste Sync-Claims (echte DB)", () => {
  it("eine verwaiste Claim-Zeile wird nach der Schwelle übernommen, das Ereignis genau einmal verbucht", async () => {
    const { userId, session, event } = await setup();
    await orphanClaim(userId, event, 60_000);

    // Jung: gilt noch als „läuft“, kein endgültiger Fehler, nichts verbucht.
    const [young] = await processSyncEvents(userId, [event]);
    expect(young.status).toBe("error");
    expect(young.terminal).toBeUndefined();
    expect(await logCount(userId)).toBe(0);

    // Uhr vorstellen: jetzt ist die Zeile verwaist und wird neu verarbeitet.
    const later = new Date(Date.now() + STALE_CLAIM_MS);
    const [taken] = await processSyncEvents(userId, [event], { now: later });
    expect(taken.status).toBe("applied");
    expect(await logCount(userId)).toBe(2);
    const [after] = await getDb().select().from(studySessions).where(eq(studySessions.id, session.id));
    expect(after.status).toBe("completed");

    // Erneutes Senden verbucht nichts doppelt.
    const [again] = await processSyncEvents(userId, [event], { now: later });
    expect(again.status).toBe("already_applied");
    expect(await logCount(userId)).toBe(2);
    const rows = await getDb().select().from(syncEvents).where(and(eq(syncEvents.userId, userId), eq(syncEvents.clientEventId, event.clientEventId)));
    expect(rows).toHaveLength(1);
  });

  it("Fehler nach dem Verbuchen (vor dem Abschluss der Claim-Zeile): nichts bleibt verbucht, der nächste Versuch verbucht genau einmal", async () => {
    const { userId, event } = await setup();
    const db = getDb();
    const fn = `fail_claim_${event.clientEventId.replaceAll("-", "")}`;
    // Simuliert den Abbruch genau zwischen Verbuchung und Abschluss der Claim-Zeile.
    await db.execute(sql.raw(`create function ${fn}() returns trigger language plpgsql as $$ begin if new.client_event_id = '${event.clientEventId}' and new.status like 'applied%' then raise exception 'Abbruch (Test)'; end if; return new; end $$`));
    await db.execute(sql.raw(`create trigger ${fn} before update on sync_events for each row execute function ${fn}()`));
    try {
      const [failed] = await processSyncEvents(userId, [event]);
      expect(failed.status).toBe("error");
      expect(failed.terminal).toBeUndefined();
      expect(await logCount(userId)).toBe(0);
    } finally {
      await db.execute(sql.raw(`drop trigger ${fn} on sync_events`));
      await db.execute(sql.raw(`drop function ${fn}()`));
    }
    const [retried] = await processSyncEvents(userId, [event]);
    expect(retried.status).toBe("applied");
    expect(await logCount(userId)).toBe(2);
  });

  it("eine noch laufende Verbuchung wird nicht übernommen, auch wenn ihre Claim-Zeile älter als die Schwelle ist", async () => {
    const { userId, event } = await setup();
    const db = getDb();
    await orphanClaim(userId, event, STALE_CLAIM_MS + 60_000);
    const [claim] = await db.select().from(syncEvents).where(and(eq(syncEvents.userId, userId), eq(syncEvents.clientEventId, event.clientEventId)));

    // Langsame Verbuchung in einem anderen Prozess: hält die Claim-Zeile gesperrt und schließt sie danach ab.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const slow = db.transaction(async (tx) => {
      await tx.select().from(syncEvents).where(eq(syncEvents.id, claim.id)).for("update");
      locked();
      await gate;
      await tx.update(syncEvents).set({ status: "applied", errorMessage: null, resultSummary: { score: 100, results: [] } }).where(eq(syncEvents.id, claim.id));
    });
    await isLocked;
    const takeover = processSyncEvents(userId, [event]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await slow;

    const [result] = await takeover;
    expect(result.status).toBe("error");
    expect(result.terminal).toBeUndefined();
    // Die Übernahme hat nichts verbucht; das Ergebnis der langsamen Verbuchung gilt.
    expect(await logCount(userId)).toBe(0);
    const [next] = await processSyncEvents(userId, [event]);
    expect(next.status).toBe("already_applied");
  });
});
