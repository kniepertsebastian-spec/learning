import { describe, expect, it } from "vitest";
import { parseProviderRetryDelayMs } from "./generate";

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
