import { describe, expect, it } from "vitest";
import { acceptEdges, MAX_PREREQUISITES, weakestPrerequisite, wouldCreateCycle, type Edge } from "./rules";

describe("Voraussetzungen: Regeln", () => {
  it("erkennt direkte und indirekte Kreise", () => {
    const edges: Edge[] = [["b", "a"], ["c", "b"]];
    expect(wouldCreateCycle(edges, "a", "c")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "b")).toBe(true);
    expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
  });

  it("nimmt nur zulässige Vorschläge: bekannte Konzepte, keine Kreise, keine Dubletten, höchstens drei je Konzept", () => {
    const known = new Set(["a", "b", "c", "d", "e", "f"]);
    const accepted = acceptEdges(
      [
        { conceptId: "c", requiresIds: ["b", "b", "a", "x"] },
        { conceptId: "b", requiresIds: ["c", "a"] },
        { conceptId: "d", requiresIds: ["a", "b", "c", "e", "f"] },
        { conceptId: "unbekannt", requiresIds: ["a"] },
      ],
      known,
    );
    expect(accepted).toEqual([["c", "b"], ["c", "a"], ["b", "a"], ["d", "a"], ["d", "b"], ["d", "c"]]);
    expect(accepted.filter(([c]) => c === "d")).toHaveLength(MAX_PREREQUISITES);
  });

  it("vorhandene Kanten zählen für Kreise und Obergrenze mit", () => {
    const known = new Set(["a", "b"]);
    expect(acceptEdges([{ conceptId: "a", requiresIds: ["b"] }], known, [["b", "a"]])).toEqual([]);
    expect(acceptEdges([{ conceptId: "b", requiresIds: ["a"] }], known, [["b", "a"]])).toEqual([]);
  });

  it("schwächste Voraussetzung: die erste falsche, sonst keine", () => {
    expect(weakestPrerequisite([{ requiresConceptId: "a", isCorrect: true }, { requiresConceptId: "b", isCorrect: false }, { requiresConceptId: "c", isCorrect: false }])).toBe("b");
    expect(weakestPrerequisite([{ requiresConceptId: "a", isCorrect: true }])).toBeNull();
  });
});
