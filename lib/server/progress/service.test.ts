import { describe, expect, it } from "vitest";
import { ObjectiveProgressService } from "./service";

describe("ObjectiveProgressService.calculateDifficultyWeight", () => {
  it("weights the actual difficulty values used by generated questions", () => {
    // Regression test for the bug documented in the code: this previously
    // checked for "hard"/"medium"/"easy", which never matched the real
    // beginner/intermediate/advanced values (draftQuestionSchema in
    // lib/server/ai/schemas.ts), silently making difficulty weighting a
    // no-op since step 10 of roadmap2.md.
    expect(ObjectiveProgressService.calculateDifficultyWeight("advanced")).toBe(1.15);
    expect(ObjectiveProgressService.calculateDifficultyWeight("intermediate")).toBe(1.0);
    expect(ObjectiveProgressService.calculateDifficultyWeight("beginner")).toBe(0.85);
  });

  it("no longer matches the old, wrong difficulty labels", () => {
    expect(ObjectiveProgressService.calculateDifficultyWeight("hard")).toBe(1.0);
    expect(ObjectiveProgressService.calculateDifficultyWeight("medium")).toBe(1.0);
    expect(ObjectiveProgressService.calculateDifficultyWeight("easy")).toBe(1.0);
  });

  it("falls back to a neutral weight for unknown or missing difficulty", () => {
    expect(ObjectiveProgressService.calculateDifficultyWeight(null)).toBe(1.0);
    expect(ObjectiveProgressService.calculateDifficultyWeight("")).toBe(1.0);
  });
});

describe("ObjectiveProgressService.calculateRecencyWeight", () => {
  it("weights the most recent answer (index 0) higher than older ones", () => {
    const total = 10;
    const mostRecent = ObjectiveProgressService.calculateRecencyWeight(0, total);
    const oldest = ObjectiveProgressService.calculateRecencyWeight(total - 1, total);
    expect(mostRecent).toBeGreaterThan(oldest);
    expect(mostRecent).toBe(1.0);
    expect(oldest).toBeCloseTo(0.55);
  });
});
