import { afterEach, describe, expect, it } from "vitest";
import { CURRICULUM_MODEL, LESSONS_MODEL } from "@/lib/claude";
import { classifyGenerationError, estimateCostUsd } from "./content-generation";

describe("classifyGenerationError", () => {
  it("classifies an exhausted daily quota as 'quota', not just 'rate_limit'", () => {
    const output =
      'RateLimitError: 429 {"type":"error","error":{"type":"rate_limit_error",' +
      '"message":"This request would exceed your organization\'s tokens per day limit"}}';
    expect(classifyGenerationError(output)).toBe("quota");
  });

  it("classifies a short-term 429 without daily-quota wording as 'rate_limit'", () => {
    const output =
      'RateLimitError: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}';
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
    expect(
      classifyGenerationError(
        'InternalServerError: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      ),
    ).toBe("provider_outage");
    expect(classifyGenerationError("FetchError: fetch failed (ECONNRESET)")).toBe(
      "provider_outage",
    );
  });

  it("classifies the Anthropic SDK's native structured-output parse failure as 'schema', not 'provider_outage'", () => {
    // Realer Fehlerfall: eine Stacktrace-Zeilennummer wie
    // "MessageStream.ts:505:43" traf zuvor auf den (mittlerweile entfernten)
    // bare-\b5\d\d\b-Check und klassifizierte einen Zod-Validierungsfehler
    // fälschlich als "provider_outage" ("KI-Anbieter nicht erreichbar").
    const output =
      'AnthropicError: Failed to parse structured output: Error: Failed to parse structured output: [...]\n' +
      "    at parseOutputFormat (/app/node_modules/@anthropic-ai/sdk/src/lib/parser.ts:123:11)\n" +
      "    at MessageStream._MessageStream_addStreamEvent (/app/node_modules/@anthropic-ai/sdk/src/lib/MessageStream.ts:505:43)";
    expect(classifyGenerationError(output)).toBe("schema");
  });

  it("does not misclassify a bare 3-digit stacktrace line number as a rate limit or outage", () => {
    expect(
      classifyGenerationError("TypeError: x is not a function\n    at foo (/app/bar.ts:429:12)"),
    ).toBe("internal");
    expect(
      classifyGenerationError("TypeError: x is not a function\n    at foo (/app/bar.ts:503:12)"),
    ).toBe("internal");
  });

  it("falls back to 'internal' for anything else", () => {
    expect(classifyGenerationError("TypeError: Cannot read properties of undefined")).toBe(
      "internal",
    );
    expect(
      classifyGenerationError("ClaudeConfigError: ANTHROPIC_API_KEY ist nicht gesetzt"),
    ).toBe("internal");
  });
});

describe("estimateCostUsd", () => {
  const ENV_KEYS = [
    "ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD",
    "ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD",
    "ANTHROPIC_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD",
    "ANTHROPIC_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD",
  ] as const;
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns null when no pricing is configured, rather than inventing a number", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(estimateCostUsd(1_000_000, 1_000_000, CURRICULUM_MODEL)).toBeNull();
  });

  it("returns null for a model it has no price slot for, rather than guessing", () => {
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    expect(estimateCostUsd(1_000_000, 1_000_000, "claude-opus-5")).toBeNull();
  });

  it("computes cost linearly from the curriculum model's configured per-million prices", () => {
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "2";
    expect(estimateCostUsd(500_000, 250_000, CURRICULUM_MODEL)).toBeCloseTo(0.5 * 1 + 0.25 * 2, 6);
  });

  it("prices the lessons model independently from the curriculum model", () => {
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "15";
    process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "5";
    expect(estimateCostUsd(1_000_000, 1_000_000, LESSONS_MODEL)).toBeCloseTo(1 + 5, 6);
    expect(estimateCostUsd(1_000_000, 1_000_000, CURRICULUM_MODEL)).toBeCloseTo(3 + 15, 6);
  });

  it("uses only the configured side when the other price is unset", () => {
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    delete process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    expect(estimateCostUsd(1_000_000, 999_999_999, CURRICULUM_MODEL)).toBeCloseTo(3, 6);
  });

  it("returns 0 for zero tokens when pricing is configured", () => {
    process.env.ANTHROPIC_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "5";
    expect(estimateCostUsd(0, 0, LESSONS_MODEL)).toBe(0);
  });
});
