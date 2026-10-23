import { describe, expect, it } from "vitest";
import { estimateRun, missingKinds, validateExplanation, type ExplanationSource } from "./generate";

const lesson = { de: "Ein Router leitet Pakete anhand der Zieladresse zwischen Netzen weiter. ".repeat(10), en: "A router forwards packets between networks based on the destination address. ".repeat(10) };
const long = (s: string) => `${s} `.repeat(4).trim();

describe("Alternativerklärungen: Regeln", () => {
  it("fehlende Arten", () => {
    expect(missingKinds([])).toEqual(["worked_example", "analogy"]);
    expect(missingKinds(["analogy"])).toEqual(["worked_example"]);
    expect(missingKinds(["analogy", "worked_example"])).toEqual([]);
  });

  it("akzeptiert eine andere, passend lange Erklärung", () => {
    const ok = validateExplanation({ kind: "analogy", content: { de: long("Stell dir einen Postboten vor, der Briefe nach Postleitzahl sortiert."), en: long("Imagine a postman who sorts letters by postcode.") } }, ["analogy"], lesson);
    expect(ok.ok).toBe(true);
  });

  it("verwirft falsche Art, zu kurz, zu lang und zu nah an der Lektion", () => {
    const text = { de: long("Stell dir einen Postboten vor, der Briefe sortiert."), en: long("Imagine a postman who sorts the letters.") };
    expect(validateExplanation({ kind: "example", content: text }, ["analogy"], lesson).ok).toBe(false);
    expect(validateExplanation({ kind: "analogy", content: { de: "kurz", en: "short" } }, ["analogy"], lesson).ok).toBe(false);
    expect(validateExplanation({ kind: "analogy", content: { de: "x ".repeat(1200), en: "y ".repeat(1200) } }, ["analogy"], lesson).reason).toContain("Länge");
    expect(validateExplanation({ kind: "analogy", content: { de: lesson.de.slice(0, 600), en: long("An analogy that is long enough for the check to pass") } }, ["analogy"], lesson).reason).toBe("zu ähnlich zur Lektion");
  });

  it("Kostenschätzung zählt nur Lernziele mit fehlenden Arten", () => {
    const base: ExplanationSource = { objectiveId: "a", code: "1.1", title: "Routing", lessonText: lesson, existingKinds: [] };
    const est = estimateRun([base, { ...base, objectiveId: "b", existingKinds: ["worked_example", "analogy"] }, { ...base, objectiveId: "c", existingKinds: ["analogy"] }]);
    expect(est.objectives).toBe(2);
    expect(est.explanations).toBe(3);
    expect(est.completionTokens).toBeGreaterThan(0);
  });
});
