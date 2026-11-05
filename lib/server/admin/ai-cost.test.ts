import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRICULUM_MODEL } from "@/lib/gemini";
import { estimateCostUsd } from "./ai-cost";

/**
 * CURRICULUM_MODEL und LESSONS_MODEL fallen beide auf dasselbe reale
 * Gemini-Modell zurück, solange niemand GEMINI_LESSONS_MODEL abweichend
 * konfiguriert (siehe lib/gemini.ts) - für die "unabhängige Bepreisung"-Tests
 * unten müssen sie deshalb künstlich auseinandergezogen werden, genau wie
 * ein Admin es per Env-Var täte, der Lessons- und Curriculum-Kosten
 * getrennt tracken will.
 */
async function withDistinctLessonsModel<T>(
  fn: (models: {
    curriculumModel: string;
    lessonsModel: string;
    estimateCostUsd: typeof estimateCostUsd;
  }) => T | Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.stubEnv("GEMINI_LESSONS_MODEL", "gemini-test-lessons-model");
  try {
    const { CURRICULUM_MODEL: curriculumModel, LESSONS_MODEL: lessonsModel } = await import(
      "@/lib/gemini"
    );
    const { estimateCostUsd: freshEstimateCostUsd } = await import("./ai-cost");
    return await fn({ curriculumModel, lessonsModel, estimateCostUsd: freshEstimateCostUsd });
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
}

describe("estimateCostUsd", () => {
  const ENV_KEYS = [
    "GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD",
    "GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD",
    "GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD",
    "GEMINI_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD",
  ] as const;
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns null for an unknown model without configured prices, rather than inventing a number", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-unbekannt-1")).toBeNull();
  });

  it("kennt den Preis von gemini-3.8-flash ohne Einträge in der .env; die .env hat Vorrang", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash")).toBeCloseTo(0.75 + 3.75, 6);
    process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "2";
    process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "4";
    try {
      expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash")).toBeCloseTo(6, 6);
    } finally {
      delete process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD;
      delete process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    }
  });

  it("ignores the retired ANTHROPIC_* price variables", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    try {
      // ein Modell ohne eingebauten Preis: die alten Variablen ändern daran nichts
      expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-unbekannt-1")).toBeNull();
    } finally {
      delete process.env.ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD;
    }
  });

  it("nutzt das allgemeine Preispaar für jedes Gemini-Modell, modellspezifische Preise haben Vorrang", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "0.75";
    process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "3.75";
    try {
      expect(estimateCostUsd(1_000_000, 1_000_000, CURRICULUM_MODEL)).toBeCloseTo(4.5, 6);
      expect(estimateCostUsd(1_000_000, 0, "gemini-irgendein-modell")).toBeCloseTo(0.75, 6);
      expect(estimateCostUsd(1_000_000, 1_000_000, "claude-opus-5")).toBeNull(); // nur Gemini-Modelle
      process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "2";
      process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "10";
      expect(estimateCostUsd(1_000_000, 1_000_000, CURRICULUM_MODEL)).toBeCloseTo(12, 6);
    } finally {
      delete process.env.GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD;
      delete process.env.GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    }
  });

  it("returns null for a model it has no price slot for, rather than guessing", () => {
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    process.env.GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    expect(estimateCostUsd(1_000_000, 1_000_000, "claude-opus-5")).toBeNull();
  });

  it("computes cost linearly from the curriculum model's configured per-million prices", () => {
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "2";
    expect(estimateCostUsd(500_000, 250_000, CURRICULUM_MODEL)).toBeCloseTo(0.5 * 1 + 0.25 * 2, 6);
  });

  it("prices the lessons model independently from the curriculum model", async () => {
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "15";
    process.env.GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "1";
    process.env.GEMINI_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD = "5";
    await withDistinctLessonsModel(({ curriculumModel, lessonsModel, estimateCostUsd: estimate }) => {
      expect(estimate(1_000_000, 1_000_000, lessonsModel)).toBeCloseTo(1 + 5, 6);
      expect(estimate(1_000_000, 1_000_000, curriculumModel)).toBeCloseTo(3 + 15, 6);
    });
  });

  it("uses only the configured side when the other price is unset", () => {
    process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "3";
    delete process.env.GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD;
    expect(estimateCostUsd(1_000_000, 999_999_999, CURRICULUM_MODEL)).toBeCloseTo(3, 6);
  });

  it("returns 0 for zero tokens when pricing is configured", async () => {
    process.env.GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD = "5";
    await withDistinctLessonsModel(({ lessonsModel, estimateCostUsd: estimate }) => {
      expect(estimate(0, 0, lessonsModel)).toBe(0);
    });
  });
});
