import { describe, expect, it } from "vitest";
import type { CourseBlueprintV1 } from "./schemas";
import { partTitle, splitBlueprint } from "./split";
import { validateBlueprint } from "./validation";

const objective = (d: number, i: number) => ({
  id: `o-${d}-${i}`,
  code: `${d}.${i}`,
  title: `O ${d}.${i}`,
  description: "x",
  examWeight: 0.1,
  complexity: "medium" as const,
  requiredConcepts: ["a"],
  commonMisconceptions: [],
  lessonPlan: ["l"],
  sourceLocators: [],
  recommendedQuestions: 4,
  requiredScenarios: [],
});

function blueprint(sizes: number[]): CourseBlueprintV1 {
  const total = sizes.reduce((a, b) => a + b, 0);
  return {
    schemaVersion: "course-blueprint-v1",
    requestId: "r",
    title: "Groß",
    description: "d",
    language: "de",
    provider: "P",
    examQuestionCount: null,
    examDurationMinutes: null,
    passingScore: null,
    scoreScale: null,
    sources: [],
    domains: sizes.map((n, d) => ({ id: `d${d + 1}`, title: `Domain ${d + 1}`, weight: n / total, objectives: Array.from({ length: n }, (_, i) => objective(d + 1, i + 1)) })),
  } as unknown as CourseBlueprintV1;
}

const count = (b: CourseBlueprintV1) => b.domains.reduce((n, d) => n + d.objectives.length, 0);

describe("Große Kurse aufteilen", () => {
  it("unter der Grenze bleibt alles ein Kurs", () => {
    const b = blueprint([30, 40]);
    expect(splitBlueprint(b, 80)).toEqual([b]);
  });

  it("ganze Domains, ungefähr gleich große Teile, kein Lernziel fehlt, Gewichte je Teil normiert und gültig", () => {
    const b = blueprint([30, 30, 30, 30]);
    const parts = splitBlueprint(b, 80);
    expect(parts.map(count)).toEqual([60, 60]);
    expect(parts.flatMap((p) => p.domains.flatMap((d) => d.objectives.map((o) => o.code)))).toEqual(b.domains.flatMap((d) => d.objectives.map((o) => o.code)));
    for (const p of parts) expect(validateBlueprint(p)).toEqual([]);
  });

  it("eine Domain über der Grenze wird geteilt", () => {
    const parts = splitBlueprint(blueprint([170]), 80);
    expect(parts.map(count)).toEqual([57, 57, 56]);
    expect(parts[1].domains[0].title).toBe("Domain 1 (2/3)");
    expect(parts.every((p) => p.domains.every((d) => d.objectives.length <= 80))).toBe(true);
  });

  it("Teiltitel je Sprache", () => {
    expect(partTitle("AWS", 2, 3, "de")).toBe("AWS (Teil 2 von 3)");
    expect(partTitle("AWS", 2, 3, "en")).toBe("AWS (Part 2 of 3)");
  });
});
