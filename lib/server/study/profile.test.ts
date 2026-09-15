import { describe, expect, it } from "vitest";
import { validateStudyProfileInput, type StudyProfileInput } from "./profile";

function input(overrides: Partial<StudyProfileInput> = {}): StudyProfileInput {
  return {
    examDate: null,
    dailyGoalType: "minutes",
    dailyGoalValue: 15,
    activeDays: [1, 2, 3, 4, 5, 6, 7],
    preferredLocale: null,
    ...overrides,
  };
}

describe("validateStudyProfileInput", () => {
  it("returns no errors for a valid profile", () => {
    expect(validateStudyProfileInput(input())).toEqual({ errors: [] });
  });

  it("accepts a questions-based daily goal", () => {
    expect(
      validateStudyProfileInput(input({ dailyGoalType: "questions", dailyGoalValue: 20 })),
    ).toEqual({ errors: [] });
  });

  it("rejects an unknown daily goal type", () => {
    const { errors } = validateStudyProfileInput(
      input({ dailyGoalType: "hours" as StudyProfileInput["dailyGoalType"] }),
    );
    expect(errors.some((e) => e.includes("dailyGoalType"))).toBe(true);
  });

  it("rejects a zero or negative daily goal value", () => {
    expect(validateStudyProfileInput(input({ dailyGoalValue: 0 })).errors.length).toBeGreaterThan(0);
    expect(validateStudyProfileInput(input({ dailyGoalValue: -5 })).errors.length).toBeGreaterThan(0);
  });

  it("rejects a non-integer daily goal value", () => {
    expect(validateStudyProfileInput(input({ dailyGoalValue: 12.5 })).errors.length).toBeGreaterThan(0);
  });

  it("requires at least one active day", () => {
    const { errors } = validateStudyProfileInput(input({ activeDays: [] }));
    expect(errors.some((e) => e.includes("Lerntag"))).toBe(true);
  });

  it("rejects duplicate active days", () => {
    const { errors } = validateStudyProfileInput(input({ activeDays: [1, 1, 2] }));
    expect(errors.some((e) => e.includes("Duplikate"))).toBe(true);
  });

  it("rejects an out-of-range active day", () => {
    const tooLow = validateStudyProfileInput(input({ activeDays: [0] }));
    const tooHigh = validateStudyProfileInput(input({ activeDays: [8] }));
    expect(tooLow.errors.some((e) => e.includes("Wochentag"))).toBe(true);
    expect(tooHigh.errors.some((e) => e.includes("Wochentag"))).toBe(true);
  });

  it("accepts a single active day", () => {
    expect(validateStudyProfileInput(input({ activeDays: [3] }))).toEqual({ errors: [] });
  });

  it("accepts a null preferred locale", () => {
    expect(validateStudyProfileInput(input({ preferredLocale: null }))).toEqual({ errors: [] });
  });

  it("accepts de/en as preferred locale", () => {
    expect(validateStudyProfileInput(input({ preferredLocale: "de" }))).toEqual({ errors: [] });
    expect(validateStudyProfileInput(input({ preferredLocale: "en" }))).toEqual({ errors: [] });
  });

  it("rejects an unsupported preferred locale", () => {
    const { errors } = validateStudyProfileInput(
      input({ preferredLocale: "fr" as StudyProfileInput["preferredLocale"] }),
    );
    expect(errors.some((e) => e.includes("preferredLocale"))).toBe(true);
  });

  it("accepts an exam date without requiring it to be in the future", () => {
    expect(validateStudyProfileInput(input({ examDate: new Date("2020-01-01") }))).toEqual({
      errors: [],
    });
  });

  it("collects multiple errors at once", () => {
    const { errors } = validateStudyProfileInput(
      input({ dailyGoalValue: -1, activeDays: [9] }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
