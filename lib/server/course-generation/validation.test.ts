import { describe, expect, it } from "vitest";
import { conceptPresent, validateObjectiveContent } from "./validation";
import type { CourseBlueprintObjective, ObjectiveContentResponse } from "./schemas";

const objective = {
  id: "o1", code: "1.1", title: "T", description: "D", examWeight: 1, complexity: "medium",
  requiredConcepts: ["Subnetzmaske"], commonMisconceptions: [], lessonPlan: ["x"], sourceLocators: [], recommendedQuestions: 1, requiredScenarios: [],
} as unknown as CourseBlueprintObjective;

function content(over: { de?: string; en?: string; locator?: string | null }): ObjectiveContentResponse {
  return {
    sections: [{
      title: { de: "A", en: "A" }, estimatedMinutes: 10, difficulty: "beginner",
      content: { de: over.de ?? "Text", en: over.en ?? "Text" }, keyTakeaways: { de: ["a", "b"], en: ["a", "b"] }, examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
    }],
    questions: [{
      difficulty: "beginner", type: "knowledge", question: { de: "F?", en: "Q?" },
      options: ["a", "b", "c", "d"].map((t, i) => ({ text: { de: t, en: t }, isCorrect: i === 0 })), explanation: { de: "E", en: "E" },
      sourceLocator: over.locator === undefined ? null : over.locator,
    }],
  } as unknown as ObjectiveContentResponse;
}

const excerpts = [{ locator: "playbook · Abschnitt 1", text: "x" }];

describe("validateObjectiveContent: Nachsicht bei Sprache und Quellenverweis", () => {
  it("ein Konzept, das nur in der deutschen Fassung steht, zählt als vorhanden; fehlt es überall, ist es ein Fehler", () => {
    expect(validateObjectiveContent(objective, content({ de: "Die Subnetzmaske legt das Netz fest." }), excerpts)).toEqual([]);
    expect(validateObjectiveContent(objective, content({}), excerpts)[0]).toContain("Subnetzmaske");
  });

  it("ein leicht abweichender Quellenverweis ist kein Fehler, ein ganz fremder schon", () => {
    const withConcept = { de: "Subnetzmaske" };
    expect(validateObjectiveContent(objective, content({ ...withConcept, locator: "Playbook · abschnitt 1" }), excerpts)).toEqual([]);
    expect(validateObjectiveContent(objective, content({ ...withConcept, locator: "Abschnitt 1" }), excerpts)).toEqual([]);
    expect(validateObjectiveContent(objective, content({ ...withConcept, locator: "S. 999 irgendwo" }), excerpts)[0]).toContain("unbekannten Locator");
  });
});

describe("conceptPresent", () => {
  const text = "Mit dem AWS Storage Gateway lassen sich hybride Speicherlösungen aufbauen, die lokale Systeme anbinden.";
  it("erkennt Konzepte mit Klammerzusatz und Umformulierung, aber keine fremden", () => {
    expect(conceptPresent("Hybride Speicherlösungen (z.B. AWS Storage Gateway)", text)).toBe(true);
    expect(conceptPresent("Hybride Speicherlösungen (z.B. Snowball Edge)", text)).toBe(true); // Hauptbegriff genügt
    expect(conceptPresent("Storage Gateway Typen und lokale Anbindung", text)).toBe(true); // Mehrheit der Wörter
    expect(conceptPresent("Kubernetes Cluster Autoscaling", text)).toBe(false);
    expect(conceptPresent("VPC", "Das Netzwerk")).toBe(false); // ein kurzes Einwort-Konzept muss wörtlich vorkommen
  });
});
