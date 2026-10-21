import { describe, expect, it } from "vitest";
import { buildTrainingItems, computeWeights, decideFit } from "./optimizer";

const DAY = 86_400_000;
const T0 = new Date("2026-01-01T08:00:00Z");

describe("Optimizer", () => {
  it("baut Trainingsdaten je Item mit Abständen in Tagen und ignoriert Einzel-Reviews", () => {
    const items = buildTrainingItems([
      { itemId: "a", rawRating: 3, timestamp: T0 },
      { itemId: "a", rawRating: 4, timestamp: new Date(T0.getTime() + 3 * DAY) },
      { itemId: "b", rawRating: 1, timestamp: T0 },
    ]);
    expect(items).toEqual([[{ rating: 3, deltaDays: 0 }, { rating: 4, deltaDays: 3 }]]);
  });

  it("entscheidet über den Fit nach Mindestanzahl und Abstand", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    expect(decideFit(399, null, now)).toBe("too_few_reviews");
    expect(decideFit(400, null, now)).toBe("fit");
    expect(decideFit(900, { fittedAt: new Date(now.getTime() - 2 * DAY), reviewCount: 500 }, now)).toBe("recent_fit");
    expect(decideFit(900, { fittedAt: new Date(now.getTime() - 8 * DAY), reviewCount: 500 }, now)).toBe("fit");
  });

  it("liefert Parameter aus fsrs-rs", async () => {
    // Synthetische Historie: viele Items mit 3-5 Reviews in wachsenden Abständen
    const items = [];
    for (let i = 0; i < 100; i++) {
      const gaps = [0, 1, 3, 7, 16].slice(0, 3 + (i % 3));
      const history = gaps.map((deltaDays, j) => ({ rating: j === 0 ? 1 + (i % 4) : (i + j) % 5 === 0 ? 1 : 3, deltaDays }));
      for (let end = 2; end <= history.length; end++) items.push(history.slice(0, end));
    }
    const weights = await computeWeights(items);
    expect(weights.length).toBe(21);
    expect(weights.every(Number.isFinite)).toBe(true);
  }, 60_000);
});
