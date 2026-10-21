import { describe, expect, it } from "vitest";
import { computeGroupMetrics, logLoss, rmse, type MetricReview } from "./metrics";
import { compareTargets, simulate } from "./simulator";
import { estimateWeights, type WeightSample } from "./weights";
import { mulberry32 } from "./simulator";

describe("Metriken", () => {
  it("Log-Loss und RMSE", () => {
    const rows = [{ predicted: 0.9, success: true }, { predicted: 0.9, success: false }];
    expect(logLoss(rows)).toBeCloseTo((-Math.log(0.9) - Math.log(0.1)) / 2, 6);
    expect(rmse(rows)).toBeCloseTo(Math.sqrt((0.01 + 0.81) / 2), 6);
    expect(logLoss([])).toBeNull();
  });

  it("Gruppenmetriken inkl. Abbruch nach 14 Tagen ohne Session", () => {
    const day = (d: number) => new Date(Date.UTC(2026, 0, d, 10));
    const mk = (userHash: string, group: MetricReview["group"], d: number, rating: number, p: number | null): MetricReview => ({
      userHash, group, timestamp: day(d), rawRating: rating, predictedR: p,
    });
    const reviews = [
      mk("a", "vanilla", 1, 3, 0.9), mk("a", "vanilla", 2, 1, 0.8),
      mk("b", "planning", 1, 3, 0.9), mk("b", "planning", 28, 4, 0.9),
    ];
    const metrics = computeGroupMetrics(reviews, day(30));
    const vanilla = metrics.find((m) => m.group === "vanilla")!;
    const planning = metrics.find((m) => m.group === "planning")!;
    expect(vanilla.abandonedUsers).toBe(1); // letzte Session vor 28 Tagen
    expect(planning.abandonedUsers).toBe(0);
    expect(vanilla.actualRetention).toBe(0.5);
    expect(vanilla.reviews).toBe(2);
    // reproduzierbar
    expect(computeGroupMetrics(reviews, day(30))).toEqual(metrics);
  });
});

describe("Simulator", () => {
  const base = { newCardsPerDay: 10, totalCards: 600, timeBudgetMin: 20, secondsPerReview: 15, seed: 3 };
  it("ist reproduzierbar", () => {
    expect(simulate({ days: 120, rTarget: 0.9, ...base })).toEqual(simulate({ days: 120, rTarget: 0.9, ...base }));
  });
  it("niedrigeres r_ziel erzeugt weniger Workload", () => {
    const [low, high] = compareTargets([0.75, 0.9], base);
    expect(low.totalReviews).toBeLessThan(high.totalReviews);
  });
  it("Pause: nach Wiedereinstieg bleibt jeder Tag im Limit", () => {
    const result = simulate({ days: 120, rTarget: 0.9, ...base, pauseDays: new Set(Array.from({ length: 10 }, (_, i) => 40 + i)) });
    expect(result.maxReviewsPerDay).toBeLessThanOrEqual(80);
  });
});

describe("Gewichtsschätzung", () => {
  it("findet den Faktor, der den Erfolg tatsächlich senkt", () => {
    const rand = mulberry32(9);
    const samples: WeightSample[] = Array.from({ length: 4000 }, () => {
      const features: WeightSample["features"] = [rand(), rand() < 0.5 ? 1 : 0, rand(), rand() < 0.5 ? 1 : 0];
      const p = 1 / (1 + Math.exp(-(2 - 3 * features[0]))); // nur Energie wirkt
      return { features, predictedR: 0.88, success: rand() < p * 0.98 };
    });
    const proposal = estimateWeights(samples);
    expect(proposal.proposed.wEnergy).toBeGreaterThan(0.6);
    expect(proposal.proposed.wEnergy + proposal.proposed.wTime + proposal.proposed.wChrono + proposal.proposed.wWork).toBeCloseTo(1, 6);
  });
});
