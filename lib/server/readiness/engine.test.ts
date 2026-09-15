import { describe, expect, it } from "vitest";
import { computeReadiness, type ReadinessInputs } from "./engine";

function inputs(overrides: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    totalObjectives: 20,
    attemptedObjectives: 20,
    avgMasteryOverAttempted: 85,
    daysSinceLastActivity: 1,
    totalAnsweredQuestions: 150,
    recentExamScores: [82, 78],
    ...overrides,
  };
}

describe("computeReadiness", () => {
  it("returns INSUFFICIENT_DATA with a null score when confidence is too low", () => {
    const result = computeReadiness(
      inputs({
        totalObjectives: 20,
        attemptedObjectives: 1,
        avgMasteryOverAttempted: 100,
        daysSinceLastActivity: 1,
        totalAnsweredQuestions: 3,
        recentExamScores: [],
      }),
    );
    expect(result.level).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBeNull();
  });

  it("returns a well-prepared level for strong, broad, recent, well-tested practice", () => {
    const result = computeReadiness(inputs());
    expect(result.level).toBe("WELL_PREPARED");
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(80);
  });

  it("never derives readiness from a single exam attempt alone", () => {
    // Perfect single mock exam, but no other practice/coverage at all - one
    // data point must not read as well-prepared, whether that shows up as a
    // low score or as "not enough data yet" (both are correct here; a lone
    // exam score isn't itself sufficient signal for a confident number).
    const result = computeReadiness(
      inputs({
        totalObjectives: 20,
        attemptedObjectives: 0,
        avgMasteryOverAttempted: 0,
        daysSinceLastActivity: null,
        totalAnsweredQuestions: 0,
        recentExamScores: [100],
      }),
    );
    expect(result.level).not.toBe("WELL_PREPARED");
    expect(result.level).not.toBe("ADEQUATELY_PREPARED");
  });

  it("penalizes narrow coverage even with perfect mastery on what was attempted", () => {
    const broad = computeReadiness(inputs({ attemptedObjectives: 20, avgMasteryOverAttempted: 90 }));
    const narrow = computeReadiness(inputs({ attemptedObjectives: 2, avgMasteryOverAttempted: 90 }));
    expect(narrow.breakdown.contentScore).toBeLessThan(broad.breakdown.contentScore);
  });

  it("lowers the readiness score for stale practice", () => {
    const recent = computeReadiness(inputs({ daysSinceLastActivity: 1 }));
    const stale = computeReadiness(inputs({ daysSinceLastActivity: 60 }));
    expect(stale.breakdown.recencyFactor).toBeLessThan(recent.breakdown.recencyFactor);
    expect(stale.score!).toBeLessThan(recent.score!);
  });

  it("factors in the trend across recent mock exams, not just one", () => {
    const withTrend = computeReadiness(inputs({ recentExamScores: [60, 65] }));
    const withoutExam = computeReadiness(inputs({ recentExamScores: [] }));
    expect(withTrend.breakdown.examTrend).toBeCloseTo(62.5);
    expect(withTrend.score).not.toBe(withoutExam.score);
  });

  it("increases confidence with more answered questions, coverage, and mock exams", () => {
    const low = computeReadiness(
      inputs({ totalAnsweredQuestions: 5, attemptedObjectives: 4, recentExamScores: [] }),
    );
    const high = computeReadiness(
      inputs({ totalAnsweredQuestions: 200, attemptedObjectives: 20, recentExamScores: [80, 82] }),
    );
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });

  it("caps the score within 0-100", () => {
    const result = computeReadiness(
      inputs({ avgMasteryOverAttempted: 100, recentExamScores: [100, 100] }),
    );
    expect(result.score!).toBeLessThanOrEqual(100);
  });

  it("handles zero objectives without dividing by zero", () => {
    const result = computeReadiness(
      inputs({ totalObjectives: 0, attemptedObjectives: 0, avgMasteryOverAttempted: 0 }),
    );
    expect(result.breakdown.objectiveCoverage).toBe(0);
    expect(Number.isFinite(result.confidence)).toBe(true);
  });
});
