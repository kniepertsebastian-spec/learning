import { describe, expect, it } from "vitest";
import { buildActivityCalendar, computeActivityTrends } from "./trends";

const NOW = new Date("2026-02-01T12:00:00Z");

function daysAgo(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d;
}

describe("computeActivityTrends", () => {
  it("counts distinct active days within each window", () => {
    const activityDates = [daysAgo(1), daysAgo(1), daysAgo(5), daysAgo(20), daysAgo(60)];
    const [w7, w30, w90] = computeActivityTrends(activityDates, [], [7, 30, 90], NOW);
    expect(w7.activeDays).toBe(2); // day -1 and day -5
    expect(w30.activeDays).toBe(3); // + day -20
    expect(w90.activeDays).toBe(4); // + day -60
  });

  it("counts total activity events, not just distinct days", () => {
    const activityDates = [daysAgo(1), daysAgo(1), daysAgo(1)];
    const [w7] = computeActivityTrends(activityDates, [], [7], NOW);
    expect(w7.totalActivityEvents).toBe(3);
    expect(w7.activeDays).toBe(1);
  });

  it("returns null average accuracy when no scored events fall in the window", () => {
    const [w7] = computeActivityTrends([], [{ date: daysAgo(60), score: 80 }], [7], NOW);
    expect(w7.avgAccuracy).toBeNull();
  });

  it("averages accuracy only over events within the window", () => {
    const events = [
      { date: daysAgo(2), score: 100 },
      { date: daysAgo(3), score: 80 },
      { date: daysAgo(60), score: 0 }, // outside the 7-day window
    ];
    const [w7] = computeActivityTrends([], events, [7], NOW);
    expect(w7.avgAccuracy).toBe(90);
  });

  it("includes an event from today itself", () => {
    const events = [{ date: daysAgo(0), score: 50 }];
    const [w7] = computeActivityTrends([], events, [7], NOW);
    expect(w7.avgAccuracy).toBe(50);
  });

  it("produces independent results for each window size", () => {
    const activityDates = [daysAgo(1), daysAgo(15), daysAgo(45)];
    const results = computeActivityTrends(activityDates, [], [7, 30, 90], NOW);
    expect(results.map((r) => r.activeDays)).toEqual([1, 2, 3]);
  });
});

describe("buildActivityCalendar", () => {
  it("returns exactly `days` entries, oldest first, ending today", () => {
    const calendar = buildActivityCalendar([], 5, NOW);
    expect(calendar).toHaveLength(5);
    expect(calendar[calendar.length - 1].date).toBe("2026-02-01");
    expect(calendar[0].date).toBe("2026-01-28");
  });

  it("fills days without activity with count 0 instead of omitting them", () => {
    const calendar = buildActivityCalendar([daysAgo(2)], 5, NOW);
    expect(calendar.filter((d) => d.count === 0)).toHaveLength(4);
  });

  it("counts multiple activities on the same day", () => {
    const calendar = buildActivityCalendar([daysAgo(0), daysAgo(0), daysAgo(0)], 1, NOW);
    expect(calendar[0].count).toBe(3);
  });
});
