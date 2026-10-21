import { describe, expect, it } from "vitest";
import { nearDuplicate, orderMatters, shuffleOptions } from "./variety";
import { autoFixObjectiveContent, validateObjectiveContent } from "./validation";

const L = (s: string) => ({ de: s, en: s });
const opts = (...t: string[]) => t.map((x, i) => ({ text: L(x), isCorrect: i === 0 }));

describe("Antwortoptionen mischen", () => {
  it("stabil je Frage, nicht immer vorn, nichts geht verloren", () => {
    const o = opts("richtig", "b", "c", "d");
    const a = shuffleOptions(o, L("Weil."), "Q-1");
    expect(shuffleOptions(o, L("Weil."), "Q-1")).toEqual(a);
    expect([...a].map((x) => x.text.de).sort()).toEqual(["b", "c", "d", "richtig"]);
    const positions = new Set(Array.from({ length: 40 }, (_, i) => shuffleOptions(o, L("Weil."), `Q-${i}`).findIndex((x) => x.isCorrect)));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
  it("Reihenfolge mit Bedeutung bleibt", () => {
    expect(orderMatters(opts("x", "All of the above"), L("e"))).toBe(true);
    expect(orderMatters(opts("x", "Alle oben genannten"), L("e"))).toBe(true);
    expect(orderMatters(opts("x", "y"), L("Antwort B ist richtig, weil …"))).toBe(true);
    const o = opts("a", "b", "keine der genannten");
    expect(shuffleOptions(o, L("e"), "Q")).toBe(o);
  });
});

describe("Fast gleiche Fragen", () => {
  it("umgestellte Fragen gelten als doppelt, verschiedene kurze nicht", () => {
    expect(nearDuplicate("Which command lists all running pods in the default namespace?", "In the default namespace, which command lists all running pods?")).toBe(true);
    expect(nearDuplicate("What is a VLAN?", "What is a VPN?")).toBe(false);
    expect(nearDuplicate("Which command lists all running pods in the default namespace?", "Which command deletes a failed deployment in the production cluster?")).toBe(false);
  });
  it("Validierung und Auto-Fix erkennen umformulierte Dubletten", () => {
    const q = (text: string) => ({ question: L(text), explanation: L("e"), difficulty: "beginner", type: "knowledge", sourceLocator: null, options: opts("a", "b", "c", "d") });
    const content = { sections: [], questions: [q("Which command lists all running pods in the default namespace?"), q("In the default namespace, which command lists all running pods?")] } as never;
    const objective = { requiredConcepts: [], recommendedQuestions: 1, complexity: "low" } as never;
    expect(validateObjectiveContent(objective, content, []).some((e) => e.includes("identisch"))).toBe(true);
    expect(autoFixObjectiveContent(content, []).content.questions).toHaveLength(1);
  });
});
