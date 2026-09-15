import { describe, expect, it } from "vitest";
import { computeNextReview, DEFAULT_EASE_FACTOR } from "./scheduler";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("computeNextReview", () => {
  it("schedules an incorrect answer earlier than a correct one from the same starting state", () => {
    const incorrect = computeNextReview(null, "incorrect", "intermediate", NOW);
    const correct = computeNextReview(null, "correct", "intermediate", NOW);
    expect(incorrect.dueAt.getTime()).toBeLessThan(correct.dueAt.getTime());
  });

  it("resets repetitions to 0 on an incorrect answer", () => {
    const afterTwoCorrect = computeNextReview(
      computeNextReview(null, "correct", "intermediate", NOW),
      "correct",
      "intermediate",
      NOW,
    );
    expect(afterTwoCorrect.repetitions).toBe(2);

    const afterIncorrect = computeNextReview(afterTwoCorrect, "incorrect", "intermediate", NOW);
    expect(afterIncorrect.repetitions).toBe(0);
  });

  it("lowers the ease factor on an incorrect answer, floored at 1.3", () => {
    const first = computeNextReview(null, "incorrect", "intermediate", NOW);
    expect(first.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR - 0.2);

    let state = first;
    for (let i = 0; i < 20; i++) {
      state = computeNextReview(state, "incorrect", "intermediate", NOW);
    }
    expect(state.easeFactor).toBeCloseTo(1.3);
  });

  it("lengthens the interval with repeated correct answers", () => {
    const rep1 = computeNextReview(null, "correct", "intermediate", NOW);
    const rep2 = computeNextReview(rep1, "correct", "intermediate", NOW);
    const rep3 = computeNextReview(rep2, "correct", "intermediate", NOW);

    expect(rep2.intervalDays).toBeGreaterThan(rep1.intervalDays);
    expect(rep3.intervalDays).toBeGreaterThan(rep2.intervalDays);
    expect(rep2.dueAt.getTime()).toBeGreaterThan(rep1.dueAt.getTime());
    expect(rep3.dueAt.getTime()).toBeGreaterThan(rep2.dueAt.getTime());
  });

  it("schedules a due-immediately incorrect answer at (or before) now", () => {
    const result = computeNextReview(null, "incorrect", "intermediate", NOW);
    expect(result.dueAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it("gives an advanced-difficulty question a shorter interval than an otherwise identical beginner question", () => {
    const base = computeNextReview(null, "correct", "intermediate", NOW);
    const advanced = computeNextReview(base, "correct", "advanced", NOW);
    const beginner = computeNextReview(base, "correct", "beginner", NOW);
    expect(advanced.intervalDays).toBeLessThan(beginner.intervalDays);
  });

  it("never schedules less than one day out for a correct answer", () => {
    const result = computeNextReview(null, "correct", "advanced", NOW);
    expect(result.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it("treats unknown or missing difficulty as neutral (same as intermediate)", () => {
    const base = computeNextReview(null, "correct", "intermediate", NOW);
    const unknown = computeNextReview(base, "correct", null, NOW);
    const neutral = computeNextReview(base, "correct", "intermediate", NOW);
    expect(unknown.intervalDays).toBe(neutral.intervalDays);
  });
});
