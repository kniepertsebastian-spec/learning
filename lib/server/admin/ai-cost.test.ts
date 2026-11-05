import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRICULUM_MODEL } from "@/lib/gemini";
import { batchPriceFactor, estimateCostUsd } from "./ai-cost";

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

describe("Batch-Preis und Tagging-Modell", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("Batch-Aufrufe kosten standardmäßig die Hälfte, auch der Cache-Anteil", () => {
    vi.stubEnv("GEMINI_BATCH_PRICE_FACTOR", "");
    expect(batchPriceFactor()).toBe(0.5);
    const normal = estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash", 400_000)!;
    const batch = estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash", 400_000, { batch: true })!;
    expect(batch).toBeCloseTo(normal / 2, 9);
  });

  it("GEMINI_BATCH_PRICE_FACTOR überschreibt den Faktor; Unsinn fällt auf 0,5 zurück", () => {
    vi.stubEnv("GEMINI_BATCH_PRICE_FACTOR", "0.6");
    expect(batchPriceFactor()).toBe(0.6);
    expect(estimateCostUsd(1_000_000, 0, "gemini-3.8-flash", 0, { batch: true })).toBeCloseTo(0.75 * 0.6, 9);
    for (const bad of ["0", "-1", "2", "abc"]) {
      vi.stubEnv("GEMINI_BATCH_PRICE_FACTOR", bad);
      expect(batchPriceFactor()).toBe(0.5);
    }
  });

  it("eine leer durchgereichte Variable (docker-compose) gilt als nicht gesetzt: Cache-Token bleiben bei 10 %, nicht gratis", () => {
    const withCache = () => estimateCostUsd(1_000_000, 0, "gemini-3.8-flash", 1_000_000)!;
    vi.stubEnv("GEMINI_CACHED_PROMPT_PRICE_FACTOR", "");
    expect(withCache()).toBeCloseTo(0.075, 9);
    vi.stubEnv("GEMINI_CACHED_PROMPT_PRICE_FACTOR", "0.25");
    expect(withCache()).toBeCloseTo(0.1875, 9);
    vi.stubEnv("GEMINI_CACHED_PROMPT_PRICE_FACTOR", "0");
    expect(withCache()).toBe(0); // ausdrücklich 0 bleibt möglich
  });

  it("ohne Batch ändert sich nichts (Rückwärtsverträglichkeit der Signatur)", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash")).toBeCloseTo(0.75 + 3.75, 6);
    expect(estimateCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash", 0, { batch: false })).toBeCloseTo(0.75 + 3.75, 6);
  });

  it("das Tagging-Modell ist standardmäßig das Lektionsmodell; ein eigenes bekommt einen eigenen Preis", async () => {
    vi.resetModules();
    const same = await import("@/lib/gemini");
    expect(same.TAGGING_MODEL).toBe(same.LESSONS_MODEL);

    vi.resetModules();
    vi.stubEnv("GEMINI_TAGGING_MODEL", "gemini-test-tagging-model");
    vi.stubEnv("GEMINI_TAGGING_PRICE_PER_MILLION_PROMPT_TOKENS_USD", "0.1");
    vi.stubEnv("GEMINI_TAGGING_PRICE_PER_MILLION_COMPLETION_TOKENS_USD", "0.4");
    const { TAGGING_MODEL } = await import("@/lib/gemini");
    const { estimateCostUsd: estimate } = await import("./ai-cost");
    expect(TAGGING_MODEL).toBe("gemini-test-tagging-model");
    expect(estimate(1_000_000, 1_000_000, TAGGING_MODEL)).toBeCloseTo(0.5, 6);
  });
});
