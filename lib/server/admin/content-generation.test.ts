import { afterEach, describe, expect, it } from "vitest";
import { classifyGenerationError, estimateCostUsd } from "./content-generation";

describe("classifyGenerationError", () => {
  it("classifies an exhausted daily quota as 'quota', not just 'rate_limit'", () => {
    const output =
      'ApiError: got status: 429. {"error":{"code":429,"message":"You exceeded your current quota",' +
      '"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}';
    expect(classifyGenerationError(output)).toBe("quota");
  });

  it("classifies a short-term 429 without daily-quota wording as 'rate_limit'", () => {
    const output =
      'ApiError: got status: 429. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"rate limit exceeded"}}';
    expect(classifyGenerationError(output)).toBe("rate_limit");
  });

  it("classifies a schema-validation failure as 'schema'", () => {
    expect(
      classifyGenerationError(
        "AIGenerationError: KI-Antwort entspricht nicht dem erwarteten Schema: invalid type",
      ),
    ).toBe("schema");
    expect(
      classifyGenerationError("AIGenerationError: KI-Antwort konnte nicht als JSON geparst werden."),
    ).toBe("schema");
  });

  it("classifies a 5xx or network failure as 'provider_outage'", () => {
    expect(classifyGenerationError("ApiError: got status: 503. UNAVAILABLE")).toBe(
      "provider_outage",
    );
    expect(classifyGenerationError("FetchError: fetch failed (ECONNRESET)")).toBe(
      "provider_outage",
    );
  });

  it("falls back to 'internal' for anything else", () => {
    expect(classifyGenerationError("TypeError: Cannot read properties of undefined")).toBe(
      "internal",
    );
    expect(
      classifyGenerationError("GeminiConfigError: GEMINI_API_KEY ist nicht gesetzt"),
    ).toBe("internal");
  });
});

describe("estimateCostUsd", () => {
  const ENV_KEYS = [
    "GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD",
    "GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD",
  ] as const;
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns null when no pricing is configured, rather than inventing a number", () => {
    delete process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD;
    delete process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBeNull();
  });

  it("computes cost linearly from configured per-million prices", () => {
    process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "2";
    expect(estimateCostUsd(500_000, 250_000)).toBeCloseTo(0.5 * 1 + 0.25 * 2, 6);
  });

  it("uses only the configured side when the other price is unset", () => {
    process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    delete process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    expect(estimateCostUsd(1_000_000, 999_999_999)).toBeCloseTo(3, 6);
  });

  it("returns 0 for zero tokens when pricing is configured", () => {
    process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "5";
    expect(estimateCostUsd(0, 0)).toBe(0);
  });
});
