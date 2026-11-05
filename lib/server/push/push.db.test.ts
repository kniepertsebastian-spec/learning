/** Web Push gegen eine ECHTE Postgres-Datenbank mit einem Fake-Sender (kein Netz): Regeln, Dosierung, Doppelschutz, Aufräumen der Abos. */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examPlans, itemStates, learningPreferences, pushDeliveries, pushSubscriptions, reviewLog, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import type { PushPayload } from "@/lib/push/logic";
import type { PushOutcome, PushSender } from "./sender";
import { countSubscriptions, getPushPreferences, removeSubscription, runPushReminders, savePushPreferences, saveSubscription, sendToUser } from "./service";

const run = TEST_DB ? describe : describe.skip;

/** Donnerstag, 5. November 2026, 19:30 in Berlin (MEZ). */
const NOW = new Date("2026-11-05T18:30:00Z");
const DAY = 86_400_000;

run("Web Push (echte DB, Fake-Sender)", () => {
  const userIds: string[] = [];
  const certIds: string[] = [];

  function fakeSender(outcome: PushOutcome | Record<string, PushOutcome> = "ok") {
    const calls: Array<{ endpoint: string; payload: PushPayload }> = [];
    const sender: PushSender = async (target, payload) => {
      calls.push({ endpoint: target.endpoint, payload });
      return typeof outcome === "string" ? outcome : (outcome[target.endpoint] ?? "ok");
    };
    return { sender, calls };
  }

  async function newUser(options: { locale?: "de" | "en"; tz?: string } = {}) {
    const id = await seedUser(options.tz ?? "Europe/Berlin");
    userIds.push(id);
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await saveSubscription(id, { endpoint, p256dh: "p".repeat(30), authKey: "a".repeat(12), locale: options.locale ?? "de", userAgent: "vitest" });
    return { id, endpoint };
  }

  /** Fällige Fragen und Reviews zur Lernstunde 19 (so lernt diese Person). */
  async function withDueItems(userId: string, due: number, habitHour = 19) {
    const course = await seedCourse(Math.max(due, 1));
    certIds.push(course.certId);
    const db = getDb();
    for (const itemId of course.questionIds.slice(0, due)) await db.insert(itemStates).values({ userId, itemId, stability: 5, difficulty: 5, due: new Date(NOW.getTime() - 3_600_000) });
    for (let i = 0; i < 6; i++) {
      await db.insert(reviewLog).values({ userId, itemId: course.questionIds[0], sessionId: randomUUID(), timestampUtc: new Date(NOW.getTime() - (i + 2) * DAY), localHour: habitHour, weekday: 4, rawRating: 3 });
    }
    return course;
  }

  async function completedSession(userId: string, certificationId: string, daysAgo: number) {
    await getDb().insert(studySessions).values({ userId, certificationId, status: "completed", goalType: "minutes", goalValue: 10, completedAt: new Date(NOW.getTime() - daysAgo * DAY) });
  }

  const sentTo = <T extends { endpoint: string }>(calls: T[], endpoint: string) => calls.filter((c) => c.endpoint === endpoint);

  afterEach(async () => {
    if (userIds.length) await getDb().delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  });
  afterAll(async () => {
    const db = getDb();
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
  });

  it("ohne Abo wird nichts gesendet (kein Opt-in, keine Nachricht)", async () => {
    const id = await seedUser();
    userIds.push(id);
    await withDueItems(id, 5);
    const { sender, calls } = fakeSender();
    await runPushReminders(NOW, sender);
    expect(calls.filter((c) => c.endpoint.includes(id))).toHaveLength(0);
    expect(await countSubscriptions(id)).toBe(0);
  });

  it("fällige Wiederholungen: zur üblichen Lernzeit, einmal am Tag, in der Sprache des Geräts", async () => {
    const { id, endpoint } = await newUser({ locale: "en" });
    await withDueItems(id, 4);
    const { sender, calls } = fakeSender();

    await runPushReminders(new Date("2026-11-05T16:30:00Z"), sender); // 17:30 Berlin: vor der Lernzeit
    expect(sentTo(calls, endpoint)).toHaveLength(0);

    await runPushReminders(NOW, sender); // 19:30
    const mine = sentTo(calls, endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload).toMatchObject({ title: "Reviews are waiting", body: "4 questions are due now. A few minutes are enough.", url: "/" });

    await runPushReminders(new Date(NOW.getTime() + 3_600_000), sender); // 20:30, derselbe Tag
    expect(sentTo(calls, endpoint)).toHaveLength(1);
    const [row] = await getDb().select().from(pushDeliveries).where(eq(pushDeliveries.userId, id));
    expect(row).toMatchObject({ kind: "reviews_due", ref: "day:2026-11-05" });

    await runPushReminders(new Date(NOW.getTime() + DAY), sender); // nächster Tag, weiter fällig
    expect(sentTo(calls, endpoint)).toHaveLength(2);
  });

  it("dosiert: zu wenige fällige Fragen, heute schon gelernt oder die Art ausgeschaltet → keine Nachricht", async () => {
    const few = await newUser();
    await withDueItems(few.id, 2);
    const learned = await newUser();
    const learnedCourse = await withDueItems(learned.id, 5);
    await completedSession(learned.id, learnedCourse.certId, 0);
    const off = await newUser();
    await withDueItems(off.id, 5);
    await savePushPreferences(off.id, { reviewsDue: false });
    const { sender, calls } = fakeSender();
    await runPushReminders(NOW, sender);
    expect(sentTo(calls, few.endpoint)).toHaveLength(0);
    expect(sentTo(calls, learned.endpoint)).toHaveLength(0);
    expect(sentTo(calls, off.endpoint)).toHaveLength(0);
  });

  it("andere Lernzeit: wer morgens lernt, wird morgens erinnert und nicht abends", async () => {
    const { id, endpoint } = await newUser();
    await withDueItems(id, 4, 7); // Median 7 → ins Fenster geschoben: 8 Uhr
    const { sender, calls } = fakeSender();
    await runPushReminders(NOW, sender); // 19:30: außerhalb 8 bis 10 Uhr
    expect(sentTo(calls, endpoint)).toHaveLength(0);
    await runPushReminders(new Date("2026-11-06T07:30:00Z"), sender); // Freitag 8:30 Berlin, die Fragen sind seit gestern fällig
    expect(sentTo(calls, endpoint)).toHaveLength(1);
  });

  it("Lernserie: ohne eingeschaltete Serie („Wie ich lerne“) keine Mahnung, nur die Wiederholungen", async () => {
    const { id, endpoint } = await newUser();
    const course = await withDueItems(id, 4);
    for (const d of [1, 2, 3]) await completedSession(id, course.certId, d);
    const { sender, calls } = fakeSender();
    await runPushReminders(NOW, sender);
    expect(sentTo(calls, endpoint).map((c) => c.payload.title)).toEqual(["Wiederholungen warten"]);
  });

  it("Lernserie in Gefahr: mit eingeschalteter Serie hat sie Vorrang vor den Wiederholungen, und es bleibt bei einer Nachricht am Tag", async () => {
    const { id, endpoint } = await newUser({ locale: "en" });
    const course = await withDueItems(id, 4);
    for (const d of [1, 2, 3]) await completedSession(id, course.certId, d); // 2., 3. und 4. November, heute (5.) noch nicht
    await getDb().insert(learningPreferences).values({ userId: id, showStreak: true });
    const { sender, calls } = fakeSender();
    await runPushReminders(NOW, sender);
    expect(sentTo(calls, endpoint).map((c) => c.payload)).toEqual([
      { title: "Your study streak is at risk", body: "You have studied every day for 3 days. One session is missing today.", url: "/", tag: "daily" },
    ]);
    await runPushReminders(new Date(NOW.getTime() + 3_600_000), sender);
    expect(sentTo(calls, endpoint)).toHaveLength(1); // weder noch einmal die Serie noch die Wiederholungen
    const rows = await getDb().select().from(pushDeliveries).where(eq(pushDeliveries.userId, id));
    expect(rows.map((r) => r.kind)).toEqual(["streak_risk"]);
  });

  it("Prüfungstermin: einmal je Plan und Art, nur tagsüber, nur mit eingeschalteter Art", async () => {
    const { id, endpoint } = await newUser();
    const course = await seedCourse(1);
    certIds.push(course.certId);
    await getDb().insert(examPlans).values({ userId: id, certificationId: course.certId, scheduledAt: new Date(NOW.getTime() + 3 * DAY), status: "planned" });
    const { sender, calls } = fakeSender();

    await runPushReminders(new Date("2026-11-05T02:00:00Z"), sender); // 3 Uhr Berlin
    expect(sentTo(calls, endpoint)).toHaveLength(0);

    await runPushReminders(new Date("2026-11-05T09:00:00Z"), sender); // 10 Uhr
    const mine = sentTo(calls, endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload).toMatchObject({ title: "Deine Prüfung rückt näher", url: "/exams" });
    expect(mine[0].payload.body).toMatch(/in [34] Tagen/);

    await runPushReminders(new Date("2026-11-05T10:00:00Z"), sender);
    await runPushReminders(new Date("2026-11-06T10:00:00Z"), sender);
    expect(sentTo(calls, endpoint)).toHaveLength(1); // Doppelschutz über den Tag hinaus

    const off = await newUser();
    await getDb().insert(examPlans).values({ userId: off.id, certificationId: course.certId, scheduledAt: new Date(NOW.getTime() + 2 * DAY), status: "planned" });
    await savePushPreferences(off.id, { examReminders: false });
    await runPushReminders(new Date("2026-11-05T09:00:00Z"), sender);
    expect(sentTo(calls, off.endpoint)).toHaveLength(0);
  });

  it("Aufräumen: verschwundenes Abo wird gelöscht, Fehler zählen hoch und löschen nach fünf, kein erreichtes Gerät gibt den Doppelschutz frei", async () => {
    const { id, endpoint } = await newUser();
    await withDueItems(id, 4);

    const error = fakeSender("error");
    await runPushReminders(NOW, error.sender);
    const [afterOne] = await getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
    expect(afterOne.failureCount).toBe(1);
    expect(await getDb().select().from(pushDeliveries).where(eq(pushDeliveries.userId, id))).toHaveLength(0); // wiederholbar

    for (let i = 0; i < 4; i++) await runPushReminders(new Date(NOW.getTime() + (i % 2) * 60_000), error.sender);
    expect(await countSubscriptions(id)).toBe(0); // nach fünf Fehlern entfernt

    const second = await newUser();
    await withDueItems(second.id, 4);
    await runPushReminders(NOW, fakeSender({ [second.endpoint]: "gone" }).sender);
    expect(await countSubscriptions(second.id)).toBe(0);
    expect(endpoint).not.toBe(second.endpoint);
  });

  it("ein Gerät fällt aus, das andere bekommt die Nachricht: der Doppelschutz gilt", async () => {
    const { id, endpoint } = await newUser();
    const secondEndpoint = `https://updates.push.services.mozilla.com/wpush/v2/${randomUUID()}`;
    await saveSubscription(id, { endpoint: secondEndpoint, p256dh: "p".repeat(30), authKey: "a".repeat(12), locale: "de", userAgent: null });
    await withDueItems(id, 4);
    const { sender, calls } = fakeSender({ [endpoint]: "error" });
    await runPushReminders(NOW, sender);
    expect(sentTo(calls, secondEndpoint)).toHaveLength(1);
    await runPushReminders(new Date(NOW.getTime() + 60_000), sender);
    expect(sentTo(calls, secondEndpoint)).toHaveLength(1);
    expect(await countSubscriptions(id)).toBe(2);
  });

  it("Abos: dieselbe Adresse gehört immer genau einer Person, Abmelden betrifft nur die eigene", async () => {
    const a = await newUser();
    const b = await seedUser();
    userIds.push(b);
    expect(await removeSubscription(b, a.endpoint)).toBe(false); // fremde Adresse
    expect(await countSubscriptions(a.id)).toBe(1);
    await saveSubscription(b, { endpoint: a.endpoint, p256dh: "q".repeat(30), authKey: "b".repeat(12), locale: "en", userAgent: null }); // Gerät, Konto gewechselt
    expect(await countSubscriptions(a.id)).toBe(0);
    expect(await countSubscriptions(b)).toBe(1);
    expect(await removeSubscription(b, a.endpoint)).toBe(true);
  });

  it("Einstellungen: ohne Zeile alles an, Änderungen bleiben einzeln erhalten", async () => {
    const id = await seedUser();
    userIds.push(id);
    expect(await getPushPreferences(id)).toEqual({ examReminders: true, reviewsDue: true, streakRisk: true });
    await savePushPreferences(id, { reviewsDue: false });
    expect(await getPushPreferences(id)).toEqual({ examReminders: true, reviewsDue: false, streakRisk: true });
    await savePushPreferences(id, { streakRisk: false });
    expect(await getPushPreferences(id)).toEqual({ examReminders: true, reviewsDue: false, streakRisk: false });
  });

  it("sendToUser erreicht alle Geräte der Person in ihrer Sprache", async () => {
    const { id, endpoint } = await newUser({ locale: "en" });
    const de = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await saveSubscription(id, { endpoint: de, p256dh: "p".repeat(30), authKey: "a".repeat(12), locale: "de", userAgent: null });
    const { sender, calls } = fakeSender();
    expect(await sendToUser(id, (locale) => ({ title: locale, body: "x", url: "/", tag: "t" }), sender)).toBe(2);
    expect(Object.fromEntries(calls.map((c) => [c.endpoint, c.payload.title]))).toEqual({ [endpoint]: "en", [de]: "de" });
  });
});
