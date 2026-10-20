/** Anonyme Abschluss-Statistik (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseCompletionEvents, examAttempts, exams, learningTime, lessonCompletions, domains, objectives, sections, lessons, users } from "@/lib/server/db/schema";
import { calendarDaysBetween, passMarkPercent, recordCertified, recordFinalExamPass } from "./completions";
import { completionCsv, completionsByCourse, completionSeries, MIN_GROUP, periodRange, periodStart, suppressSmall, windowStart } from "./report";
import { tick, IDLE_AFTER_MS } from "@/lib/client/learning-time";
import { niceTicks } from "@/components/admin/stats/CompletionChart";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

describe("Regeln", () => {
  it("Bestehensgrenze: Prozentwert des Kurses, sonst 70 %", () => {
    expect(passMarkPercent("80")).toBe(80);
    expect(passMarkPercent("750")).toBe(70);
    expect(passMarkPercent(null)).toBe(70);
  });
  it("Kalendertage: gleicher Tag = 1, angefangene Tage", () => {
    expect(calendarDaysBetween(new Date("2026-10-01T23:00:00Z"), new Date("2026-10-01T23:30:00Z"))).toBe(1);
    expect(calendarDaysBetween(new Date("2026-10-01T23:00:00Z"), new Date("2026-10-02T01:00:00Z"))).toBe(2);
  });
  it("Zeiträume: Woche ab Montag, lückenlos, Fenster", () => {
    expect(periodStart("2026-10-18", "week")).toBe("2026-10-12"); // Sonntag → Montag davor
    expect(periodStart("2026-10-19", "week")).toBe("2026-10-19");
    expect(periodStart("2026-10-19", "month")).toBe("2026-10-01");
    expect(periodRange("2026-11-01", "2027-02-01", "month")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(windowStart("month", "2026-10-19")).toBe("2024-11-01");
    expect(windowStart("year", "2026-10-19")).toBeNull();
  });
  it("Dauerwerte erst ab MIN_GROUP", () => {
    const base = { n: MIN_GROUP - 1, medianDays: 3, p25Days: 2, p75Days: 4, meanDays: 3.33, nActive: MIN_GROUP, medianActiveMinutes: 90.4, meanActiveMinutes: 100 };
    expect(suppressSmall(base)).toMatchObject({ medianDays: null, meanDays: null, medianActiveMinutes: 90 });
    expect(suppressSmall({ ...base, n: MIN_GROUP })).toMatchObject({ medianDays: 3, meanDays: 3.3 });
  });
  it("Lernzeit zählt nur sichtbar und nicht untätig", () => {
    const s = { pending: 0, lastInput: 0 };
    expect(tick(s, 1000, true).pending).toBe(5);
    expect(tick(s, 1000, false).pending).toBe(0);
    expect(tick(s, IDLE_AFTER_MS + 1, true).pending).toBe(0);
  });
  it("Achsenwerte", () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it("die Statistik-Tabelle hat keinen Bezug zu Personen", () => {
    const cols = getTableConfig(courseCompletionEvents).columns.map((c) => c.name);
    expect(cols.some((c) => /user|email|name_of|ip/i.test(c))).toBe(false);
    expect(getTableConfig(courseCompletionEvents).foreignKeys.every((fk) => fk.reference().foreignTable !== users)).toBe(true);
  });
});

run("Abschlüsse erfassen (echte DB)", () => {
  const certIds: string[] = [];
  const userIds: string[] = [];
  afterAll(async () => {
    const db = getDb();
    if (certIds.length) {
      await db.delete(courseCompletionEvents).where(inArray(courseCompletionEvents.certificationId, certIds));
      await db.delete(certifications).where(inArray(certifications.id, certIds));
    }
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  });

  async function setup(passingScore: string | null = null) {
    const db = getDb();
    const [u] = await db.insert(users).values({ email: `stats-${userIds.length}-${tag}@example.com`, passwordHash: "x" }).returning({ id: users.id });
    userIds.push(u.id);
    const [c] = await db.insert(certifications).values({ slug: `st-${certIds.length}-${tag}`, name: `Kurs ${tag}`, provider: "T", examName: "T", examVersion: "1", passingScore }).returning({ id: certifications.id });
    certIds.push(c.id);
    const [d] = await db.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [o] = await db.insert(objectives).values({ domainId: d.id, code: "1.1", title: "O" }).returning();
    const [s] = await db.insert(sections).values({ objectiveId: o.id, orderNum: 1, title: { de: "L", en: "L" } }).returning();
    await db.insert(lessons).values({ sectionId: s.id, content: { de: "x", en: "x" } });
    const [exam] = await db.insert(exams).values({ certificationId: c.id, blueprint: {} }).returning();
    return { userId: u.id, certId: c.id, sectionId: s.id, examId: exam.id };
  }
  const attempt = async (userId: string, examId: string, score: number, at: Date) =>
    (await getDb().insert(examAttempts).values({ examId, userId, score: String(score), passed: score >= 70, startedAt: at, completedAt: at }).returning({ id: examAttempts.id }))[0].id;
  const events = (certId: string) => getDb().select().from(courseCompletionEvents).where(eq(courseCompletionEvents.certificationId, certId));

  it("erstes Bestehen zählt einmal, mit Dauer und aktiver Lernzeit", async () => {
    const { userId, certId, sectionId, examId } = await setup();
    const db = getDb();
    await db.insert(lessonCompletions).values({ userId, sectionId, completedAt: new Date("2026-10-01T10:00:00Z") });
    await db.insert(learningTime).values([
      { userId, certificationId: certId, day: "2026-10-01", seconds: 1800 },
      { userId, certificationId: certId, day: "2026-10-03", seconds: 1200 },
    ]);
    const a1 = await attempt(userId, examId, 50, new Date("2026-10-02T10:00:00Z"));
    expect(a1).toBeTruthy();
    const a2 = await attempt(userId, examId, 85, new Date("2026-10-03T12:00:00Z"));
    expect(await recordFinalExamPass(userId, certId, a2, new Date("2026-10-03T12:00:00Z"))).toBe(true);
    const a3 = await attempt(userId, examId, 90, new Date("2026-10-05T12:00:00Z"));
    expect(await recordFinalExamPass(userId, certId, a3, new Date("2026-10-05T12:00:00Z"))).toBe(false);
    const rows = await events(certId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "final_exam_passed", completedOn: "2026-10-03", calendarDays: 3, activeMinutes: 50, courseName: `Kurs ${tag}` });
  });

  it("aktive Lernzeit fehlt, wenn die Messung erst nach dem ersten Lernen beginnt", async () => {
    const { userId, certId, sectionId, examId } = await setup();
    await getDb().insert(lessonCompletions).values({ userId, sectionId, completedAt: new Date("2026-09-01T10:00:00Z") });
    await getDb().insert(learningTime).values({ userId, certificationId: certId, day: "2026-10-01", seconds: 600 });
    const a = await attempt(userId, examId, 80, new Date("2026-10-02T10:00:00Z"));
    await recordFinalExamPass(userId, certId, a, new Date("2026-10-02T10:00:00Z"));
    expect((await events(certId))[0]).toMatchObject({ calendarDays: 32, activeMinutes: null });
  });

  it("Zertifikat zählt gesondert, aber nicht, wenn es vor dem Lernen hier erworben wurde", async () => {
    const { userId, certId, sectionId } = await setup();
    await getDb().insert(lessonCompletions).values({ userId, sectionId, completedAt: new Date("2026-10-01T10:00:00Z") });
    expect(await recordCertified(userId, certId, randomUUID(), new Date("2025-01-01T00:00:00Z"))).toBe(false);
    expect(await recordCertified(userId, certId, randomUUID(), new Date("2026-10-10T00:00:00Z"))).toBe(true);
    expect((await events(certId)).map((e) => e.kind)).toEqual(["certified"]);
  });

  it("Auswertung: Zeitreihe, je Kurs, CSV ohne Dauer unter MIN_GROUP", async () => {
    const { certId } = await setup();
    await getDb().insert(courseCompletionEvents).values(
      Array.from({ length: MIN_GROUP }, (_, i) => ({ certificationId: certId, courseName: "Auswertung", kind: "final_exam_passed" as const, completedOn: `2026-10-${String(5 + i).padStart(2, "0")}`, calendarDays: 10 + i, activeMinutes: 60 * (i + 1) })),
    );
    await getDb().insert(courseCompletionEvents).values({ certificationId: certId, courseName: "Auswertung", kind: "certified", completedOn: "2026-10-12", calendarDays: 20 });
    const series = await completionSeries("week", certId, "2026-10-19");
    expect(series).toHaveLength(26);
    expect(series.slice(-3)).toEqual([
      { start: "2026-10-05", final_exam_passed: 5, certified: 0 }, // 5.–9.10. = Mo–Fr derselben Woche
      { start: "2026-10-12", final_exam_passed: 0, certified: 1 },
      { start: "2026-10-19", final_exam_passed: 0, certified: 0 },
    ]);
    const rows = await completionsByCourse(certId, "2026-10-19");
    const exam = rows.find((r) => r.kind === "final_exam_passed")!;
    expect(exam).toMatchObject({ total: MIN_GROUP, medianDays: 12, medianActiveMinutes: 180, lastWeek: 0, lastMonth: MIN_GROUP });
    expect(rows.find((r) => r.kind === "certified")).toMatchObject({ total: 1, medianDays: null });
    const csv = await completionCsv("year", certId);
    expect(csv.split("\n")[0]).toBe("zeitraum_beginn;kurs;art;anzahl;median_tage;median_aktive_minuten");
    expect(csv).toContain("2026-01-01;Auswertung;abschlusspruefung;5;12;180");
    expect(csv).toContain("2026-01-01;Auswertung;zertifikat;1;;");
  });
});
