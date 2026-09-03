import { describe, expect, it } from "vitest";
import { classifyGenerationError } from "./content-generation";

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
