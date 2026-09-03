import { describe, expect, it } from "vitest";
import { buildSourceText, suggestSlug, validateBlueprintDraft } from "./blueprint";
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
      domains: [
        { name: "Domain 1", weightPercent: 50, objectives: [objective("1.1"), objective("1.2")] },
        { name: "Domain 2", weightPercent: 50, objectives: [objective("2.1")] },
      ],
      ...overrides,
    };
  }

  it("returns no warnings for a clean, plausible draft", () => {
    expect(validateBlueprintDraft(draft())).toEqual([]);
  });

  it("flags duplicate objective codes", () => {
    const warnings = validateBlueprintDraft(
      draft({
        domains: [
          { name: "Domain 1", weightPercent: 100, objectives: [objective("1.1"), objective("1.1")] },
        ],
      }),
    );
    expect(warnings.some((w) => w.includes("1.1"))).toBe(true);
  });

  it("flags a weight sum that isn't close to 100", () => {
    const warnings = validateBlueprintDraft(
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
    const warnings = validateBlueprintDraft(
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
    const warnings = validateBlueprintDraft(
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
    const warnings = validateBlueprintDraft(
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

  it("flags low-confidence objectives so they require manual confirmation", () => {
    const warnings = validateBlueprintDraft(
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
    expect(warnings.some((w) => w.includes("niedriger Extraktionssicherheit"))).toBe(true);
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
