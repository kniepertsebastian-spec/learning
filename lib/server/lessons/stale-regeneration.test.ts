import { describe, expect, it } from "vitest";
import { estimateObjectiveTokens, MIN_CURRENT_QUESTIONS, needsRegeneration, sectionsNeedingLesson, type LessonRow, type SectionRow } from "./stale-regeneration";

const section = (id: string, orderNum: number): SectionRow => ({ id, orderNum, title: { de: id, en: id }, estimatedMinutes: 10, difficulty: "beginner" });
const lesson = (sectionId: string, reviewStatus: LessonRow["reviewStatus"]): LessonRow => ({ id: `l-${sectionId}`, sectionId, reviewStatus, version: 1 });

describe("sectionsNeedingLesson", () => {
  it("returns sections without a lesson and sections with a stale lesson", () => {
    const sections = [section("a", 1), section("b", 2), section("c", 3)];
    const lessons = [lesson("a", "grounded"), lesson("b", "stale")];
    expect(sectionsNeedingLesson({ sections, lessons }).map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("treats every review status except stale as current", () => {
    const sections = [section("a", 1), section("b", 2), section("c", 3)];
    const lessons = [lesson("a", "unreviewed"), lesson("b", "needs_review"), lesson("c", "grounded")];
    expect(sectionsNeedingLesson({ sections, lessons })).toEqual([]);
  });
});

describe("needsRegeneration", () => {
  const sections = [section("a", 1)];
  const current = [lesson("a", "grounded")];

  it("is false when every lesson is current and there are enough current questions", () => {
    expect(needsRegeneration({ sections, lessons: current, currentQuestions: MIN_CURRENT_QUESTIONS })).toBe(false);
  });

  it("is true for a stale lesson", () => {
    expect(needsRegeneration({ sections, lessons: [lesson("a", "stale")], currentQuestions: 9 })).toBe(true);
  });

  it("is true for a missing lesson", () => {
    expect(needsRegeneration({ sections, lessons: [], currentQuestions: 9 })).toBe(true);
  });

  it("is true when stale questions leave fewer than the minimum current ones", () => {
    expect(needsRegeneration({ sections, lessons: current, currentQuestions: MIN_CURRENT_QUESTIONS - 1 })).toBe(true);
  });

  it("is true for an objective with no sections and too few questions, false once it has enough", () => {
    expect(needsRegeneration({ sections: [], lessons: [], currentQuestions: 0 })).toBe(true);
    expect(needsRegeneration({ sections: [], lessons: [], currentQuestions: MIN_CURRENT_QUESTIONS })).toBe(false);
  });
});

describe("estimateObjectiveTokens", () => {
  it("grows with the number of lessons that have to be written", () => {
    const one = estimateObjectiveTokens({ sections: [section("a", 1)], lessons: [] });
    const three = estimateObjectiveTokens({ sections: [section("a", 1), section("b", 2), section("c", 3)], lessons: [] });
    expect(three.completion).toBeGreaterThan(one.completion);
    expect(three.prompt).toBe(one.prompt);
  });

  it("still plans for the questions when no lesson has to be written", () => {
    const none = estimateObjectiveTokens({ sections: [section("a", 1)], lessons: [lesson("a", "grounded")] });
    expect(none.completion).toBeGreaterThan(0);
  });
});
