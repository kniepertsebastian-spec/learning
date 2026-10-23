import { describe, expect, it } from "vitest";
import { isFeatureEnabled } from "@/lib/server/feature-flags";

describe("isFeatureEnabled", () => {
  it("ist standardmäßig an und hart abschaltbar", () => {
    expect(isFeatureEnabled("pretest_questions", "u", {})).toBe(true);
    expect(isFeatureEnabled("pretest_questions", "u", { FEATURE_PRETEST_QUESTIONS: "0" })).toBe(false);
  });
  it("teilt Nutzer stabil nach Anteil zu", () => {
    const env = { FEATURE_PRETEST_QUESTIONS_ROLLOUT: "50" };
    const ids = Array.from({ length: 400 }, (_, i) => `user-${i}`);
    const on = ids.filter((id) => isFeatureEnabled("pretest_questions", id, env));
    expect(on.length).toBeGreaterThan(140);
    expect(on.length).toBeLessThan(260);
    expect(ids.filter((id) => isFeatureEnabled("pretest_questions", id, env))).toEqual(on);
    expect(isFeatureEnabled("pretest_questions", "u", { FEATURE_PRETEST_QUESTIONS_ROLLOUT: "0" })).toBe(false);
  });
  it("behandelt ungültige Werte wie 'alle'", () => {
    expect(isFeatureEnabled("pretest_questions", "u", { FEATURE_PRETEST_QUESTIONS_ROLLOUT: "abc" })).toBe(true);
  });
});
