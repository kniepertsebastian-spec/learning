import { describe, expect, it } from "vitest";
import { normalizeGeneratedAliases, parseProviderRetryDelayMs, sanitizeJsonControlChars } from "./generate";

function geminiErrorWithDetails(details: unknown[]): Error {
  return new Error(
    JSON.stringify({
      error: {
        code: 429,
        message: "You exceeded your current quota, please check your plan and billing details.",
        status: "RESOURCE_EXHAUSTED",
        details,
      },
    }),
  );
}

describe("parseProviderRetryDelayMs", () => {
  it("reads the RetryInfo retryDelay (in seconds) from a Gemini 429 error body", () => {
    const error = geminiErrorWithDetails([
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
    ]);
    expect(parseProviderRetryDelayMs(error)).toBe(21_000);
  });

  it("handles fractional-second delays", () => {
    const error = geminiErrorWithDetails([
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1.5s" },
    ]);
    expect(parseProviderRetryDelayMs(error)).toBe(1_500);
  });

  it("caps an implausibly long provider delay instead of sleeping forever", () => {
    const error = geminiErrorWithDetails([
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "9999s" },
    ]);
    expect(parseProviderRetryDelayMs(error)).toBe(120_000);
  });

  it("returns undefined when there is no RetryInfo detail", () => {
    const error = geminiErrorWithDetails([
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] },
    ]);
    expect(parseProviderRetryDelayMs(error)).toBeUndefined();
  });

  it("returns undefined for a non-JSON or unrelated error message", () => {
    expect(parseProviderRetryDelayMs(new Error("ECONNRESET"))).toBeUndefined();
    expect(parseProviderRetryDelayMs("not an error object")).toBeUndefined();
    expect(parseProviderRetryDelayMs(null)).toBeUndefined();
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
    const raw = '{"a":"xy"}';
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ a: "xy" });
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
