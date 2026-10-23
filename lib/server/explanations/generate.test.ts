import { describe, expect, it } from "vitest";
import { estimateRun, missingKinds, validateExplanation, type ExplanationSource } from "./generate";

const lesson = { de: "Ein Router leitet Pakete anhand der Zieladresse zwischen Netzen weiter. ".repeat(10), en: "A router forwards packets between networks based on the destination address. ".repeat(10) };
const long = (s: string) => `${s} `.repeat(4).trim();

describe("Alternativerklärungen: Regeln", () => {
  it("fehlende Arten", () => {
    expect(missingKinds([])).toEqual(["worked_example", "gapped_example", "analogy"]);
    expect(missingKinds(["analogy"])).toEqual(["worked_example", "gapped_example"]);
    expect(missingKinds(["analogy", "worked_example", "gapped_example"])).toEqual([]);
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

  it("Beispiel mit Lücken braucht Lücken und eine Lösung, andere Arten keine Lösung", () => {
    const withGaps = { de: long("Zuerst wird die ___ des Pakets gelesen, dann die Tabelle durchsucht."), en: long("First the ___ of the packet is read, then the table is searched.") };
    const solution = { de: "Zieladresse", en: "destination address" };
    expect(validateExplanation({ kind: "gapped_example", content: withGaps, solution }, ["gapped_example"], lesson).ok).toBe(true);
    expect(validateExplanation({ kind: "gapped_example", content: withGaps }, ["gapped_example"], lesson).reason).toBe("Lösung fehlt");
    expect(validateExplanation({ kind: "gapped_example", content: { de: long("Ganz ohne Lücke, aber sonst ein vollständiges Beispiel zum Thema."), en: long("No gap at all, but otherwise a complete example on the topic.") }, solution }, ["gapped_example"], lesson).reason).toBe("keine Lücken");
    expect(validateExplanation({ kind: "analogy", content: { de: long("Wie ein Postbote, der Briefe nach Postleitzahl sortiert und weitergibt."), en: long("Like a postman who sorts letters by postcode and passes them on.") }, solution }, ["analogy"], lesson).reason).toBe("Lösung nur beim Beispiel mit Lücken");
  });

  it("Kostenschätzung zählt nur Lernziele mit fehlenden Arten", () => {
    const base: ExplanationSource = { objectiveId: "a", code: "1.1", title: "Routing", lessonText: lesson, existingKinds: [] };
    const est = estimateRun([base, { ...base, objectiveId: "b", existingKinds: ["worked_example", "gapped_example", "analogy"] }, { ...base, objectiveId: "c", existingKinds: ["analogy"] }]);
    expect(est.objectives).toBe(2);
    expect(est.explanations).toBe(5);
    expect(est.completionTokens).toBeGreaterThan(0);
  });
});
