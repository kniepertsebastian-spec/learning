import { describe, expect, it } from "vitest";
import {
  balanceInterval, clampIntervalToExam, dailyLimit, dayKey, daysUntilExam, examAdjustedTarget, loadBalanceSpread,
  moreStudyExtra, prioritize, selectDailyQueue, type DueCandidate,
} from "./planner";
import { scheduleReview, retrievability, type ItemState } from "./fsrs";
import { targetRetention } from "./state";

const DAY = 86_400_000;
const NOW = new Date("2026-03-02T08:00:00Z"); // Montag
const weekdayOf = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

const cand = (id: string, r: number, extra: Partial<DueCandidate> = {}): DueCandidate => ({
  itemId: id, retrievability: r, difficulty: 5, due: NOW, ...extra,
});

describe("Tageslimit", () => {
  it("floor(Budget·60 / Ø-Sekunden) mit Rückfall 15 s", () => {
    expect(dailyLimit({ timeBudgetMin: 10 })).toBe(40);
    expect(dailyLimit({ timeBudgetMin: 10, avgSecondsPerReview: 20 })).toBe(30);
  });
  it("Φ senkt, leichte Tage halbieren, „Mehr lernen“ erhöht", () => {
    expect(dailyLimit({ timeBudgetMin: 10, phi: 1 })).toBe(28);
    expect(dailyLimit({ timeBudgetMin: 10, lightDay: true })).toBe(20);
    const limit = dailyLimit({ timeBudgetMin: 10 });
    expect(dailyLimit({ timeBudgetMin: 10, extra: moreStudyExtra(limit) })).toBeGreaterThan(limit);
  });
});

describe("Priorisierung", () => {
  it("niedrigste Retrievability zuerst", () => {
    expect(prioritize([cand("a", 0.8), cand("b", 0.5), cand("c", 0.7)], false).map((c) => c.itemId)).toEqual(["b", "c", "a"]);
  });
  it("bei Prüfungsdatum ziehen relevante Items vor", () => {
    const list = [cand("a", 0.7, { examRelevance: 0 }), cand("b", 0.78, { examRelevance: 1 })];
    expect(prioritize(list, false)[0].itemId).toBe("a");
    expect(prioritize(list, true)[0].itemId).toBe("b");
  });
  it("nicht gezeigte Karten werden gezählt, Rückstau pausiert neue Karten", () => {
    const due = Array.from({ length: 50 }, (_, i) => cand(`i${i}`, 0.5 + i / 100));
    const result = selectDailyQueue({ due, limit: 20 });
    expect(result.queue).toHaveLength(20);
    expect(result.deferred).toBe(30);
    expect(result.newCardsPaused).toBe(true);
    expect(selectDailyQueue({ due: due.slice(0, 10), limit: 20 }).newCardsPaused).toBe(false);
  });
});

describe("Prüfungsmodus", () => {
  it("r_ziel steigt linear in den letzten 21 Tagen bis zur Obergrenze", () => {
    expect(examAdjustedTarget(0.8, 30)).toBe(0.8);
    expect(examAdjustedTarget(0.8, null)).toBe(0.8);
    expect(examAdjustedTarget(0.8, 21)).toBeCloseTo(0.8);
    expect(examAdjustedTarget(0.8, 0)).toBeCloseTo(0.9);
    expect(examAdjustedTarget(0.8, 10.5)).toBeGreaterThan(0.8);
  });
  it("Intervalle gehen nicht über das Prüfungsdatum hinaus", () => {
    expect(clampIntervalToExam(30, 12)).toBe(12);
    expect(clampIntervalToExam(30, null)).toBe(30);
    expect(clampIntervalToExam(30, 0)).toBe(1);
  });
  it("Tage bis zur Prüfung", () => {
    expect(daysUntilExam(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe(5);
    expect(daysUntilExam(new Date(NOW.getTime() - DAY), NOW)).toBeNull();
    expect(daysUntilExam(null, NOW)).toBeNull();
  });
});

describe("Load Balancing", () => {
  it("Streuung ±5 %, ab Intervall 7 mindestens ±1", () => {
    expect([3, 6, 7, 14, 40, 100].map((n) => loadBalanceSpread(n))).toEqual([0, 0, 1, 1, 2, 5]);
  });
  it("wählt den Tag mit der geringsten Last, bleibt sonst beim berechneten Intervall", () => {
    const base = { from: NOW, intervalDays: 40, weekdayOf, timeZone: "UTC" };
    const load = new Map<string, number>();
    expect(balanceInterval({ ...base, loadByDay: load })).toBe(40);
    load.set(dayKey(new Date(NOW.getTime() + 40 * DAY)), 20);
    load.set(dayKey(new Date(NOW.getTime() + 41 * DAY)), 12);
    const picked = balanceInterval({ ...base, loadByDay: load });
    expect(picked).not.toBe(40);
    expect(Math.abs(picked - 40)).toBeLessThanOrEqual(2);
  });
  it("meidet leichte Tage und überschreitet das Prüfungsdatum nicht", () => {
    const target = new Date(NOW.getTime() + 14 * DAY);
    const light = [weekdayOf(target)];
    const picked = balanceInterval({ from: NOW, intervalDays: 14, loadByDay: new Map(), lightWeekdays: light, weekdayOf, timeZone: "UTC" });
    expect(picked).not.toBe(14);
    expect(balanceInterval({ from: NOW, intervalDays: 14, loadByDay: new Map(), lightWeekdays: light, weekdayOf, timeZone: "UTC", daysToExam: 14 })).toBeLessThanOrEqual(14);
  });
});

/** Akzeptanz Phase 3: 500 Karten, 7 Tage Pause → keine Tages-Queue über dem Budget, Rückstau wird abgebaut. */
describe("Simulation: Wiedereinstieg nach 7 Tagen Pause", () => {
  it("überschreitet nie das Zeitbudget und baut den Rückstau ab", () => {
    const start = new Date("2026-01-05T08:00:00Z");
    const states = new Map<string, ItemState>();
    for (let i = 0; i < 500; i++) {
      // Alle Karten wurden vor 20 Tagen zuletzt gesehen, Intervall war ~13 Tage → alle fällig
      states.set(`i${i}`, {
        stability: 12 + (i % 5), difficulty: 4 + (i % 4), reps: 4, lapses: 0, fsrsState: 2,
        lastReview: new Date(start.getTime() - 20 * DAY), due: new Date(start.getTime() - 7 * DAY),
      });
    }
    const budgetMin = 10;
    const limit = dailyLimit({ timeBudgetMin: budgetMin, phi: 0.4 });
    let backlogDay = -1;
    for (let day = 0; day < 60; day++) {
      const now = new Date(start.getTime() + day * DAY);
      const due: DueCandidate[] = [];
      for (const [id, st] of states) {
        if (st.due <= now) due.push({ itemId: id, retrievability: retrievability(st, now) ?? 1, difficulty: st.difficulty, due: st.due });
      }
      const { queue } = selectDailyQueue({ due, limit, phi: 0.4 });
      expect(queue.length).toBeLessThanOrEqual(limit);
      expect(queue.length * 15).toBeLessThanOrEqual(budgetMin * 60);
      for (const c of queue) states.set(c.itemId, scheduleReview(states.get(c.itemId)!, 3, now, targetRetention(0.4)).state);
      if (due.length - queue.length === 0 && backlogDay < 0) backlogDay = day;
    }
    expect(backlogDay).toBeGreaterThanOrEqual(0);
    expect(backlogDay).toBeLessThan(60);
  });
});
