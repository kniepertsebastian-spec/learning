import { describe, expect, it } from "vitest";
import { computeExamResults } from "@/lib/server/psrp/metrics";

describe("computeExamResults", () => {
  it("anonymisiert und liefert Ergebnis samt Bereitschaft vor der Prüfung", () => {
    const [r] = computeExamResults([{ userId: "user-1", group: "planning", status: "passed", scheduledAt: new Date("2026-10-01"), scoresBeforeExam: [60, 85, 88, 91] }], "salt");
    expect(r.user).not.toContain("user-1");
    expect(r).toMatchObject({ group: "planning", result: "passed", readiness: { lastScore: 91 } });
  });
  it("kommt ohne Simulationen zurecht", () => {
    const [r] = computeExamResults([{ userId: "u", group: null, status: "failed", scheduledAt: new Date(), scoresBeforeExam: [] }], "s");
    expect(r.readiness).toEqual({ reached: 0, ready: false, lastScore: null });
  });
});

import { computeVariantMetrics, type MetricReview } from "@/lib/server/psrp/metrics";

describe("computeVariantMetrics", () => {
  const review = (userHash: string, rotation: boolean, variantShown: boolean, rawRating: number): MetricReview => ({
    userHash, group: "planning", timestamp: new Date(), rawRating, predictedR: null, rotation, variantShown,
  });
  it("trennt Nutzer mit und ohne Rotation sowie Variante und Original", () => {
    const m = computeVariantMetrics([review("a", true, true, 3), review("a", true, false, 1), review("b", false, false, 4)]);
    expect(m.enabled).toMatchObject({ users: 1, reviews: 2, reviewsWithVariant: 1, retentionVariant: 1, retentionOriginal: 0 });
    expect(m.disabled).toMatchObject({ users: 1, reviews: 1, reviewsWithVariant: 0, retentionVariant: null, retentionOriginal: 1 });
  });
});

import { computeFlagArms } from "@/lib/server/psrp/metrics";

describe("computeFlagArms", () => {
  it("trennt Nutzer mit und ohne Flag", () => {
    const r = (userHash: string, pretest: boolean, rawRating: number): MetricReview => ({ userHash, group: "planning", timestamp: new Date(), rawRating, predictedR: null, pretest });
    const arms = computeFlagArms([r("a", true, 3), r("a", true, 1), r("b", false, 4)], (x) => Boolean(x.pretest));
    expect(arms.enabled).toEqual({ users: 1, reviews: 2, retention: 0.5 });
    expect(arms.disabled).toEqual({ users: 1, reviews: 1, retention: 1 });
  });
});
