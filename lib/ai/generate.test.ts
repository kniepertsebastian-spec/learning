import { describe, expect, it } from "vitest";
import {
  lenientDifficultySchema,
  lenientQuestionTypeSchema,
  normalizeGeneratedAliases,
  parseRetryAfterHeaderMs,
  sanitizeJsonControlChars,
} from "./generate";

function anthropicErrorWithRetryAfter(retryAfter: string | null): unknown {
  return { status: 429, headers: new Headers(retryAfter !== null ? { "retry-after": retryAfter } : {}) };
}

describe("parseRetryAfterHeaderMs", () => {
  it("reads the retry-after header (in seconds) from a 429 error", () => {
    const error = anthropicErrorWithRetryAfter("21");
    expect(parseRetryAfterHeaderMs(error)).toBe(21_000);
  });

  it("handles fractional-second delays", () => {
    const error = anthropicErrorWithRetryAfter("1.5");
    expect(parseRetryAfterHeaderMs(error)).toBe(1_500);
  });

  it("caps an implausibly long provider delay instead of sleeping forever", () => {
    const error = anthropicErrorWithRetryAfter("9999");
    expect(parseRetryAfterHeaderMs(error)).toBe(120_000);
  });

  it("returns undefined when there is no retry-after header", () => {
    const error = anthropicErrorWithRetryAfter(null);
    expect(parseRetryAfterHeaderMs(error)).toBeUndefined();
  });

  it("returns undefined for an error without a headers object", () => {
    expect(parseRetryAfterHeaderMs(new Error("ECONNRESET"))).toBeUndefined();
    expect(parseRetryAfterHeaderMs("not an error object")).toBeUndefined();
    expect(parseRetryAfterHeaderMs(null)).toBeUndefined();
  });
});

describe("sanitizeJsonControlChars", () => {
  it("escapes a raw newline inside a string literal so JSON.parse accepts it", () => {
    const raw = '{"content":"line one\nline two"}';
    expect(() => JSON.parse(raw)).toThrow();
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ content: "line one\nline two" });
  });

  it("escapes raw tabs and carriage returns inside a string literal", () => {
    const raw = '{"a":"x\ty\rz"}';
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ a: "x\ty\rz" });
  });

  it("escapes an arbitrary control character as \\u00XX", () => {
    const raw = '{"a":"xy"}';
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ a: "xy" });
  });

  it("leaves already-valid JSON untouched", () => {
    const raw = '{"a":"line one\\nline two","b":[1,2,3]}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
    expect(JSON.parse(sanitizeJsonControlChars(raw))).toEqual(JSON.parse(raw));
  });

  it("does not touch control characters outside of string literals (whitespace between tokens)", () => {
    const raw = '{\n  "a": "b"\n}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
  });

  it("does not double-escape an already-escaped backslash-n", () => {
    const raw = '{"a":"already\\nescaped"}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
  });
});

describe("normalizeGeneratedAliases", () => {
  it("leaves an already-valid difficulty untouched", () => {
    expect(normalizeGeneratedAliases({ difficulty: "advanced" })).toEqual({ difficulty: "advanced" });
  });

  it("maps a known difficulty synonym to the exact schema token", () => {
    expect(normalizeGeneratedAliases({ difficulty: "Medium" })).toEqual({ difficulty: "intermediate" });
    expect(normalizeGeneratedAliases({ difficulty: "hard" })).toEqual({ difficulty: "advanced" });
    expect(normalizeGeneratedAliases({ difficulty: "easy" })).toEqual({ difficulty: "beginner" });
  });

  it("falls back to intermediate for a completely unrecognized difficulty instead of failing validation", () => {
    expect(normalizeGeneratedAliases({ difficulty: "super-duper-hard" })).toEqual({
      difficulty: "intermediate",
    });
  });

  it("maps a known question-type synonym to the exact schema token", () => {
    expect(normalizeGeneratedAliases({ type: "understanding" })).toEqual({ type: "comprehension" });
    expect(normalizeGeneratedAliases({ type: "debugging" })).toEqual({ type: "troubleshooting" });
  });

  it("falls back to knowledge for a completely unrecognized question type instead of failing validation", () => {
    expect(normalizeGeneratedAliases({ type: "something-unexpected" })).toEqual({ type: "knowledge" });
  });

  it("normalizes fields nested inside arrays and objects, matching the real questions[] shape", () => {
    const input = {
      lessons: [{ content: "x" }],
      questions: [
        { difficulty: "beginner", type: "knowledge" },
        { difficulty: "Hard", type: "unexpected-value" },
      ],
    };
    expect(normalizeGeneratedAliases(input)).toEqual({
      lessons: [{ content: "x" }],
      questions: [
        { difficulty: "beginner", type: "knowledge" },
        { difficulty: "advanced", type: "knowledge" },
      ],
    });
  });
});

// Anthropics eigene Structured-Output-Validierung gegen ein per
// zodOutputFormat() übergebenes Schema läuft SDK-intern, bevor
// normalizeGeneratedAliases() (Objekt-Postprocessing nach requestJson())
// je zum Zug kommt - live beobachtet: ein von der KI trotz Schema-Zwang
// geliefertes "difficulty": "medium" ließ die SDK selbst mit
// "Invalid option: expected one of beginner|intermediate|advanced"
// abbrechen. lenientDifficultySchema/lenientQuestionTypeSchema wenden
// dieselbe Alias-Toleranz als z.preprocess() direkt im Schema an, damit sie
// auch bei der SDK-internen Validierung greift.
describe("lenientDifficultySchema", () => {
  it("accepts the exact schema tokens unchanged", () => {
    expect(lenientDifficultySchema.parse("advanced")).toBe("advanced");
  });

  it("normalizes a known synonym the API itself might reject", () => {
    expect(lenientDifficultySchema.parse("medium")).toBe("intermediate");
    expect(lenientDifficultySchema.parse("Hard")).toBe("advanced");
  });

  it("falls back to intermediate instead of failing validation", () => {
    expect(lenientDifficultySchema.parse("super-duper-hard")).toBe("intermediate");
  });
});

describe("lenientQuestionTypeSchema", () => {
  it("accepts the exact schema tokens unchanged", () => {
    expect(lenientQuestionTypeSchema.parse("scenario")).toBe("scenario");
  });

  it("normalizes a known synonym the API itself might reject", () => {
    expect(lenientQuestionTypeSchema.parse("understanding")).toBe("comprehension");
  });

  it("falls back to knowledge instead of failing validation", () => {
    expect(lenientQuestionTypeSchema.parse("something-unexpected")).toBe("knowledge");
  });
});
