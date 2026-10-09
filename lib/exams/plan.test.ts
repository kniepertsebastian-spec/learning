import { describe, expect, it } from "vitest";
import { backlogPercent, buildIcs, buildStudyPlan, isoWeek, mondayOf, planReminders, readiness, type PlannedLesson } from "./plan";

const now = new Date("2026-10-09T10:00:00Z"); // Freitag, KW 41
const lessons = (n: number, minutes = 60, done = 0): PlannedLesson[] => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, title: `Lektion ${i}`, minutes, done: i < done }));

describe("Kalenderwoche", () => {
  it("ISO-Wochen", () => {
    expect(isoWeek(new Date("2026-10-09T00:00:00Z"))).toBe(41);
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe(1);
    expect(isoWeek(new Date("2027-01-03T00:00:00Z"))).toBe(53);
    expect(mondayOf(now).toISOString().slice(0, 10)).toBe("2026-10-05");
  });
});

describe("Lernplan rückwärts", () => {
  it("ohne Termin kein Plan", () => {
    expect(buildStudyPlan({ examDate: null, now, lessons: lessons(3), weakTopics: [] })).toEqual({ weeks: [], overflowMinutes: 0 });
  });
  it("letzte Woche Wiederholung, vorletzte zwei Simulationen, davor Lernen", () => {
    const { weeks } = buildStudyPlan({ examDate: new Date("2026-11-06T09:00:00Z"), now, lessons: lessons(8), weakTopics: ["Netzwerk", "RBAC"] });
    expect(weeks).toHaveLength(5);
    expect(weeks[4].kind).toBe("review");
    expect(weeks[4].lessonIds).toHaveLength(0);
    expect(weeks[3]).toMatchObject({ kind: "simulate", simulations: 2 });
    expect(weeks.slice(0, 3).every((w) => w.kind === "learn")).toBe(true);
    expect(weeks.slice(0, 3).flatMap((w) => w.lessonIds)).toHaveLength(8);
  });
  it("verteilt nach Zeitbudget (5 h = 300 Min je Woche)", () => {
    const { weeks } = buildStudyPlan({ examDate: new Date("2026-11-06T09:00:00Z"), now, lessons: lessons(8, 60), weakTopics: [] });
    expect(weeks[0].plannedMinutes).toBe(300);
    expect(weeks[1].plannedMinutes).toBe(180);
  });
  it("kurze Vorlaufzeit: nur Prüfungswoche, offener Stoff läuft über", () => {
    const { weeks, overflowMinutes } = buildStudyPlan({ examDate: new Date("2026-10-11T09:00:00Z"), now, lessons: lessons(3, 60), weakTopics: ["X"] });
    expect(weeks).toHaveLength(1);
    expect(weeks[0].kind).toBe("review");
    expect(overflowMinutes).toBe(180);
  });
  it("zwei Wochen: Lernwoche + Prüfungswoche, keine Simulationswoche", () => {
    const { weeks } = buildStudyPlan({ examDate: new Date("2026-10-16T09:00:00Z"), now, lessons: lessons(2), weakTopics: [] });
    expect(weeks.map((w) => w.kind)).toEqual(["learn", "review"]);
  });
  it("alles erledigt: nur Simulation und Wiederholung nötig, nichts verteilt", () => {
    const { weeks, overflowMinutes } = buildStudyPlan({ examDate: new Date("2026-11-06T09:00:00Z"), now, lessons: lessons(4, 60, 4), weakTopics: [] });
    expect(weeks.flatMap((w) => w.lessonIds)).toHaveLength(0);
    expect(overflowMinutes).toBe(0);
  });
  it("Termin in der Vergangenheit: kein Plan", () => {
    expect(buildStudyPlan({ examDate: new Date("2026-09-01T09:00:00Z"), now, lessons: lessons(2), weakTopics: [] }).weeks).toEqual([]);
  });
  it("Rückstand über 20 % wird erkannt", () => {
    const { weeks } = buildStudyPlan({ examDate: new Date("2026-11-20T09:00:00Z"), now: new Date("2026-10-05T09:00:00Z"), lessons: lessons(8), weakTopics: [] });
    const later = new Date("2026-10-19T09:00:00Z");
    expect(backlogPercent(weeks, new Set(), later)).toBeGreaterThan(20);
    expect(backlogPercent(weeks, new Set(weeks.flatMap((w) => w.lessonIds)), later)).toBe(0);
    expect(backlogPercent([], new Set(), later)).toBe(0);
  });
});

describe("Bereitschaft", () => {
  it("drei Simulationen in Folge ab 80", () => {
    expect(readiness([70, 82, 85])).toMatchObject({ reached: 2, ready: false });
    expect(readiness([60, 81, 85, 90])).toMatchObject({ reached: 3, ready: true });
    expect(readiness([90, 70])).toMatchObject({ reached: 0, last: [90, 70, null] });
    expect(readiness([])).toMatchObject({ reached: 0, ready: false });
  });
});

describe(".ics", () => {
  const ics = buildIcs({ uidBase: "abc", title: "CKA, Prüfung; Test", examAt: new Date("2026-11-01T09:00:00Z"), now, location: "Online", studyWeeks: [{ start: "2026-10-12", title: "Woche 1", minutes: 300 }] });
  it("gültige Struktur, CRLF, escaped, zwei Ereignisse", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261101T090000Z");
    expect(ics).toContain("SUMMARY:CKA\\, Prüfung\; Test");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("Erinnerungen", () => {
  const base = { scheduledAt: null, voucherExpiresAt: null, retakeIncluded: false, status: "planned" as const };
  it("Voucher, Termin, Wiederholungsversuch", () => {
    expect(planReminders({ ...base, voucherExpiresAt: new Date("2026-10-20T00:00:00Z") }, now)).toEqual(["voucher_expiring"]);
    expect(planReminders({ ...base, voucherExpiresAt: new Date("2027-01-20T00:00:00Z") }, now)).toEqual([]);
    expect(planReminders({ ...base, scheduledAt: new Date("2026-10-12T09:00:00Z") }, now)).toEqual(["exam_soon"]);
    expect(planReminders({ ...base, status: "failed", retakeIncluded: true }, now)).toEqual(["retake_included"]);
    expect(planReminders({ ...base, status: "cancelled", scheduledAt: new Date("2026-10-12T09:00:00Z") }, now)).toEqual([]);
  });
});
