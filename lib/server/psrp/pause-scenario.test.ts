import { describe, expect, it } from "vitest";
import { renderPauseSvg } from "./pause-chart";
import { DEFAULT_PAUSE_PARAMS, simulatePause } from "./pause-scenario";

describe("Vergleich „Eine Woche Pause“", () => {
  const scenario = simulatePause();
  const budget = scenario.assumptions.timeBudgetMin;
  const first = scenario.firstDayAfterPause;

  it("Planungsmodus überschreitet an keinem Tag das Zeitbudget", () => {
    expect(Math.max(...scenario.modes.planning.minutesByDay)).toBeLessThanOrEqual(budget);
    expect(Math.max(...scenario.modes.planning.cardsByDay)).toBeLessThanOrEqual(scenario.assumptions.dailyCardLimit);
  });

  it("Vanilla hat am ersten Tag nach der Pause mehr fällige Karten als vor der Pause und sprengt das Budget", () => {
    const vanilla = scenario.modes.vanilla;
    expect(vanilla.dueByDay[first]).toBeGreaterThan(vanilla.dueByDay[scenario.pauseStartDay - 1]);
    expect(scenario.metrics.vanilla.peakMinutesFirstDayAfterPause).toBeGreaterThan(budget);
    expect(scenario.metrics.vanilla.peakMinutesFirstDayAfterPause).toBeGreaterThan(scenario.metrics.planning.peakMinutesFirstDayAfterPause);
  });

  it("während der Pause wird nichts bearbeitet, fällige Karten sammeln sich", () => {
    for (const mode of ["vanilla", "planning"] as const) {
      const m = scenario.modes[mode];
      for (let d = scenario.pauseStartDay; d < first; d++) expect(m.cardsByDay[d]).toBe(0);
      expect(m.leftoverByDay[first - 1]).toBeGreaterThan(0);
    }
  });

  it("Planung baut den Rückstand innerhalb des Beobachtungszeitraums ab; Kennzahlen sind vollständig", () => {
    expect(scenario.metrics.planning.daysToClearBacklog).not.toBeNull();
    expect(scenario.metrics.planning.daysToClearBacklog!).toBeLessThanOrEqual(scenario.assumptions.followDays);
    expect(scenario.metrics.vanilla.retention30DaysAfterPause).toBeGreaterThan(0);
    expect(scenario.metrics.planning.retention30DaysAfterPause).toBeGreaterThan(0);
  });

  it("gleiche Parameter ergeben gleiche Ergebnisse; anderer Seed ein anderes", () => {
    expect(simulatePause()).toEqual(scenario);
    expect(simulatePause({ seed: 2 }).modes.vanilla.minutesByDay).not.toEqual(scenario.modes.vanilla.minutesByDay);
  });

  it("Annahmen stehen im Ergebnis (Platzhalter-Szenario)", () => {
    expect(scenario.assumptions).toMatchObject({ totalCards: 1000, newCardsPerDay: 10, timeBudgetMin: 15, secondsPerReview: 15, leadInDays: 60, pauseDays: 7, followDays: 30, rTarget: 0.9 });
    expect(DEFAULT_PAUSE_PARAMS.pauseDays).toBe(7);
  });

  it("SVG enthält beide Linien, Budget, Pause und die Annahmen, ist reproduzierbar und gültig maskiert", () => {
    const svg = renderPauseSvg(scenario, "de");
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).toContain("Zeitbudget: 15 min");
    expect(svg).toContain("Pause");
    expect(svg).toContain("1000 Karten");
    expect(svg).toContain("Synthetische Simulation, keine Nutzerdaten");
    expect(renderPauseSvg(scenario, "de")).toBe(svg);
    expect(renderPauseSvg(scenario, "en")).toContain("Synthetic simulation, no user data");
    expect(svg).not.toMatch(/NaN|undefined/);
  });
});
