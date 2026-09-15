import { describe, expect, it } from "vitest";
import { buildSourceText, lowConfidenceObjectiveKey, suggestSlug, validateBlueprintDraft } from "./blueprint";
import type { BlueprintExtraction } from "@/lib/server/ai/service";

function objective(code: string, confidence = 0.9) {
  return { code, title: `Objective ${code}`, description: "desc", locator: "S. 1", confidence };
}

describe("buildSourceText", () => {
  it("sorts pages by number and tags each with a page marker", () => {
    const { text, truncated } = buildSourceText([
      { pageNumber: 2, content: "second" },
      { pageNumber: 1, content: "first" },
    ]);
    expect(text.indexOf("== Seite 1 ==")).toBeLessThan(text.indexOf("== Seite 2 =="));
    expect(text).toContain("first");
    expect(text).toContain("second");
    expect(truncated).toBe(false);
  });

  it("truncates and reports it instead of silently sending a partial document", () => {
    const hugePage = { pageNumber: 1, content: "x".repeat(70_000) };
    const { text, truncated } = buildSourceText([hugePage]);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(70_000);
  });
});

describe("validateBlueprintDraft", () => {
  function draft(overrides: Partial<BlueprintExtraction> = {}): BlueprintExtraction {
    return {
      certificationName: "Test Cert",
      provider: "Test Provider",
      examCode: "T0-001",
      examQuestionCount: 90,
      examDurationMinutes: 90,
      passingScore: 750,
      scoreScale: "100-900",
      domains: [
        { name: "Domain 1", weightPercent: 50, objectives: [objective("1.1"), objective("1.2")] },
        { name: "Domain 2", weightPercent: 50, objectives: [objective("2.1")] },
      ],
      ...overrides,
    };
  }

  it("returns no errors or warnings for a clean, plausible draft", () => {
    expect(validateBlueprintDraft(draft())).toEqual({ errors: [], warnings: [] });
  });

  it("flags duplicate objective codes within the same domain as an error", () => {
    const { errors } = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 100, objectives: [objective("1.1"), objective("1.1")] },
        ],
      }),
    );
    expect(errors.some((e) => e.includes("1.1"))).toBe(true);
  });

  it("flags the same objective code reused across domains as a warning, not an error", () => {
    const { errors, warnings } = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 50, objectives: [objective("1.1")] },
          { name: "Domain 2", weightPercent: 50, objectives: [objective("1.1")] },
        ],
      }),
    );
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("1.1"))).toBe(true);
  });

  it("flags a weight sum that isn't close to 100", () => {
    const { warnings } = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 30, objectives: [objective("1.1")] },
          { name: "Domain 2", weightPercent: 30, objectives: [objective("2.1")] },
        ],
      }),
    );
    expect(warnings.some((w) => w.includes("Gewichtungen"))).toBe(true);
  });

  it("does not flag a weight sum within tolerance", () => {
    const { warnings } = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 49, objectives: [objective("1.1")] },
          { name: "Domain 2", weightPercent: 50, objectives: [objective("2.1")] },
        ],
      }),
    );
    expect(warnings.some((w) => w.includes("Gewichtungen"))).toBe(false);
  });

  it("flags when only some domains have a weight", () => {
    const { warnings } = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 50, objectives: [objective("1.1")] },
          { name: "Domain 2", weightPercent: null, objectives: [objective("2.1")] },
        ],
      }),
    );
    expect(warnings.some((w) => w.includes("Nicht für alle Domains"))).toBe(true);
  });

  it("flags a gap in a domain's objective sequence", () => {
    const { warnings } = validateBlueprintDraft(
      draft({
        domains: [
          {
            name: "Domain 1",
            weightPercent: 100,
            objectives: [objective("1.1"), objective("1.4")],
          },
        ],
      }),
    );
    expect(warnings.some((w) => w.includes("Lücke"))).toBe(true);
  });

  it("blocks approval with an error when a low-confidence objective isn't confirmed", () => {
    const { errors, warnings } = validateBlueprintDraft(
      draft({
        domains: [
          {
            name: "Domain 1",
            weightPercent: 100,
            objectives: [objective("1.1", 0.2)],
          },
        ],
      }),
    );
    expect(errors.some((e) => e.includes("1.1") && e.includes("niedrige"))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("clears the low-confidence block once that objective's position is confirmed", () => {
    const content = draft({
      domains: [
        {
          name: "Domain 1",
          weightPercent: 100,
          objectives: [objective("1.1", 0.2)],
        },
      ],
    });
    const { errors } = validateBlueprintDraft(
      content,
      new Set([lowConfidenceObjectiveKey(0, 0)]),
    );
    expect(errors).toEqual([]);
  });

  it("does not clear the block for a different objective's confirmation", () => {
    const content = draft({
      domains: [
        {
          name: "Domain 1",
          weightPercent: 100,
          objectives: [objective("1.1", 0.2)],
        },
      ],
    });
    const { errors } = validateBlueprintDraft(
      content,
      new Set([lowConfidenceObjectiveKey(0, 1)]),
    );
    expect(errors.some((e) => e.includes("1.1"))).toBe(true);
  });

  it("requires every low-confidence objective to be confirmed individually", () => {
    const content = draft({
      domains: [
        {
          name: "Domain 1",
          weightPercent: 100,
          objectives: [objective("1.1", 0.2), objective("1.2", 0.3)],
        },
      ],
    });
    const onlyFirstConfirmed = validateBlueprintDraft(
      content,
      new Set([lowConfidenceObjectiveKey(0, 0)]),
    );
    expect(onlyFirstConfirmed.errors.some((e) => e.includes("1.2"))).toBe(true);

    const bothConfirmed = validateBlueprintDraft(
      content,
      new Set([lowConfidenceObjectiveKey(0, 0), lowConfidenceObjectiveKey(0, 1)]),
    );
    expect(bothConfirmed.errors).toEqual([]);
  });

  it("flags a missing exam format (question count/duration/passing score) as a warning", () => {
    const { errors, warnings } = validateBlueprintDraft(
      draft({ examQuestionCount: null, examDurationMinutes: null, passingScore: null }),
    );
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("Prüfungsformat"))).toBe(true);
  });

  it("does not flag exam format when at least one of question count/duration/passing score is known", () => {
    const { warnings } = validateBlueprintDraft(
      draft({ examQuestionCount: null, examDurationMinutes: null, passingScore: 750 }),
    );
    expect(warnings.some((w) => w.includes("Prüfungsformat"))).toBe(false);
  });
});

describe("suggestSlug", () => {
  it("builds a lowercase, hyphenated slug from name and exam code", () => {
    expect(suggestSlug("CompTIA Security+", "SY0-701")).toBe("comptia-security-sy0-701");
  });

  it("strips diacritics", () => {
    expect(suggestSlug("Prüfung Ördnung", "X1")).toBe("prufung-ordnung-x1");
  });
});
