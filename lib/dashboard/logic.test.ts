import { describe, expect, it } from "vitest";
import { accuracy, certState, daysUntil, domainLight, greetingPart, hiddenByAbandonment, masteryPercent, pickContinueIndex, shortCodeOf, weekBars, weekStart } from "./logic";

describe("Dashboard-Logik", () => {
  it("Begrüßung nach Tageszeit", () => {
    expect([5, 10, 11, 17, 18, 23].map(greetingPart)).toEqual(["morning", "morning", "day", "day", "evening", "evening"]);
  });
  it("Abgebrochene Kurse verschwinden, Firmenzuweisungen bleiben", () => {
    expect(hiddenByAbandonment(true, false)).toBe(true);
    expect(hiddenByAbandonment(true, true)).toBe(false);
    expect(hiddenByAbandonment(false, false)).toBe(false);
  });
  it("Kartenzustände", () => {
    expect(certState({ total: 5, done: 5, hasActivity: true, examInDays: 3 })).toBe("completed");
    expect(certState({ total: 5, done: 1, hasActivity: true, examInDays: 3 })).toBe("planned");
    expect(certState({ total: 5, done: 1, hasActivity: true, examInDays: -2 })).toBe("started");
    expect(certState({ total: 5, done: 0, hasActivity: false, examInDays: null })).toBe("not_started");
    expect(certState({ total: 0, done: 0, hasActivity: true, examInDays: null })).toBe("started");
  });
  it("Tage bis zur Prüfung", () => {
    const now = new Date("2026-10-09T20:00:00Z");
    expect(daysUntil(new Date("2026-10-12T01:00:00Z"), now)).toBe(3);
    expect(daysUntil(null, now)).toBeNull();
  });
  it("Ampel und Beherrschung", () => {
    expect(masteryPercent(2, 2, 4)).toBe(75);
    expect(masteryPercent(0, 0, 0)).toBe(0);
    expect([80, 70, 69, 40, 39].map(domainLight)).toEqual(["strong", "strong", "practice", "practice", "weak"]);
  });
  it("Weitermachen: nächste offene Sektion nach der letzten", () => {
    const s = [{ id: "a", done: true }, { id: "b", done: false }, { id: "c", done: true }, { id: "d", done: false }];
    expect(pickContinueIndex(s, "c")).toBe(3);
    expect(pickContinueIndex(s, "a")).toBe(1);
    expect(pickContinueIndex(s, "d")).toBe(1);
    expect(pickContinueIndex(s.map((x) => ({ ...x, done: true })), "c")).toBe(2);
    expect(pickContinueIndex([], null)).toBe(-1);
  });
  it("Wochenbalken Mo–So", () => {
    const now = new Date("2026-10-09T10:00:00Z"); // Freitag
    expect(weekStart(now).toISOString().slice(0, 10)).toBe("2026-10-05");
    const { counts, todayIndex } = weekBars([new Date("2026-10-05T08:00:00Z"), new Date("2026-10-05T09:00:00Z"), new Date("2026-10-09T07:00:00Z"), new Date("2026-10-02T07:00:00Z")], now);
    expect(counts).toEqual([2, 0, 0, 0, 1, 0, 0]);
    expect(todayIndex).toBe(4);
  });
  it("Trefferquote und Kurzcode", () => {
    expect(accuracy([{ correct: true }, { correct: false }, { correct: true }, { correct: true }])).toBe(75);
    expect(accuracy([])).toBeNull();
    expect(shortCodeOf("CompTIA Security+", "SEC+")).toBe("SEC+");
    expect(shortCodeOf("Certified Kubernetes Administrator", null)).toBe("CKA");
  });
});
