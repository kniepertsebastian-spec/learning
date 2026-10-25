import { describe, expect, it } from "vitest";
import { computeTimeOutlook, countStudyDays, dailyMinutes, remainingNeededMinutes } from "./time-outlook";

// Montag, 2026-10-26
const now = new Date("2026-10-26T09:00:00Z");
const all = [1, 2, 3, 4, 5, 6, 7];

describe("countStudyDays", () => {
  it("zählt aktive Tage ab heute bis vor dem Prüfungstag", () => {
    expect(countStudyDays(now, new Date("2026-11-02T00:00:00Z"), all)).toBe(7); // Mo..So
    expect(countStudyDays(now, new Date("2026-11-02T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(5);
  });
});

describe("computeTimeOutlook", () => {
  const base = { now, activeDays: all, minutesPerDay: 15 };
  it("ohne Termin oder ohne Restaufwand gibt es keine Aussage", () => {
    expect(computeTimeOutlook({ ...base, examDate: null, neededMinutes: 300 })).toBeNull();
    expect(computeTimeOutlook({ ...base, examDate: "2026-12-01", neededMinutes: 0 })).toBeNull();
    expect(computeTimeOutlook({ ...base, examDate: "2026-10-20", neededMinutes: 300 })).toBeNull();
  });
  it("reicht mit Puffer", () => {
    const o = computeTimeOutlook({ ...base, examDate: "2026-12-01", neededMinutes: 300 })!; // 36 Tage · 15 = 540
    expect(o).toMatchObject({ studyDays: 36, availableMinutes: 540, status: "ok", suggestedExamDate: null });
  });
  it("wird knapp, wenn es nur ohne Puffer reicht", () => {
    const o = computeTimeOutlook({ ...base, examDate: "2026-12-01", neededMinutes: 500 })!;
    expect(o.status).toBe("tight");
    expect(o.suggestedExamDate).not.toBeNull();
  });
  it("reicht nicht und nennt Minuten pro Tag und einen passenden Termin", () => {
    const o = computeTimeOutlook({ ...base, examDate: "2026-11-09", neededMinutes: 400 })!; // 14 Tage · 15 = 210
    expect(o.status).toBe("short");
    expect(o.neededPerDay).toBe(29);
    const suggested = new Date(`${o.suggestedExamDate}T00:00:00Z`);
    expect(countStudyDays(now, suggested, all) * 15).toBeGreaterThanOrEqual(400 * 1.2);
    expect(suggested.getTime()).toBeGreaterThan(new Date("2026-11-09T00:00:00Z").getTime());
  });
  it("beachtet die aktiven Lerntage", () => {
    const weekdaysOnly = computeTimeOutlook({ ...base, activeDays: [1, 2, 3, 4, 5], examDate: "2026-11-09", neededMinutes: 100 })!;
    expect(weekdaysOnly.studyDays).toBe(10);
  });
});

describe("Umrechnungen", () => {
  it("Restaufwand und Tagesziel in Minuten", () => {
    expect(remainingNeededMinutes({ lessonMinutes: 120, unseenQuestions: 90 })).toBe(300);
    expect(dailyMinutes("questions", 20)).toBe(15); // 45 s je Frage
    expect(dailyMinutes("minutes", 15)).toBe(15);
  });
});
