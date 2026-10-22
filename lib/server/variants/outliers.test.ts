import { describe, expect, it } from "vitest";
import { findOutliers } from "@/lib/server/variants/outliers";

describe("findOutliers", () => {
  it("meldet eine Variante mit > 25 Prozentpunkten Abweichung bei genug Antworten", () => {
    expect(findOutliers([{ questionId: "o", answers: 40, correct: 32 }, { questionId: "v1", answers: 35, correct: 14 }])).toEqual(["o", "v1"]);
  });
  it("meldet nichts bei ähnlicher Quote", () => {
    expect(findOutliers([{ questionId: "o", answers: 40, correct: 30 }, { questionId: "v1", answers: 40, correct: 28 }])).toEqual([]);
  });
  it("braucht mindestens 30 Antworten auf beiden Seiten", () => {
    expect(findOutliers([{ questionId: "o", answers: 40, correct: 38 }, { questionId: "v1", answers: 29, correct: 2 }])).toEqual([]);
    expect(findOutliers([{ questionId: "o", answers: 10, correct: 10 }, { questionId: "v1", answers: 40, correct: 5 }])).toEqual([]);
  });
  it("poolt die übrigen Varianten als Vergleich", () => {
    const stats = [{ questionId: "o", answers: 30, correct: 24 }, { questionId: "v1", answers: 30, correct: 22 }, { questionId: "v2", answers: 30, correct: 6 }];
    expect(findOutliers(stats)).toEqual(["v2"]);
  });
});
