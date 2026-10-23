import { describe, expect, it } from "vitest";
import { evaluatePlacement, type PlacementAnswer } from "@/lib/server/placement/evaluate";

const a = (objectiveId: string, isCorrect: boolean, confidence: PlacementAnswer["confidence"]): PlacementAnswer => ({ objectiveId, isCorrect, confidence });
const many = (n: number, make: (i: number) => PlacementAnswer) => Array.from({ length: n }, (_, i) => make(i));

describe("evaluatePlacement", () => {
  it("besteht bei ≥ 90 % richtig und ≥ 80 % sicher und überspringt alle sicheren richtigen Lernziele", () => {
    const e = evaluatePlacement(many(10, (i) => a(`o${i}`, true, "sure")));
    expect(e.passed).toBe(true);
    expect(e.skipObjectiveIds).toHaveLength(10);
    expect(e.openObjectiveIds).toEqual([]);
  });
  it("besteht nicht mit zu vielen Fehlern", () => {
    const e = evaluatePlacement(many(10, (i) => a(`o${i}`, i >= 2, "sure")));
    expect(e.passed).toBe(false);
    expect(e.skipObjectiveIds).toEqual([]);
    expect(e.openObjectiveIds).toHaveLength(10);
  });
  it("besteht nicht, wenn zu wenige Antworten als sicher angegeben sind (auch bei lauter richtigen)", () => {
    const e = evaluatePlacement(many(10, (i) => a(`o${i}`, true, i < 7 ? "sure" : "unsure")));
    expect(e.passed).toBe(false);
  });
  it("lässt richtig geratene Lernziele offen, auch bei bestandenem Test", () => {
    const answers = [...many(9, (i) => a(`o${i}`, true, "sure")), a("geraten", true, "guessed")];
    const e = evaluatePlacement(answers);
    expect(e.passed).toBe(true);
    expect(e.skipObjectiveIds).not.toContain("geraten");
    expect(e.openObjectiveIds).toEqual(["geraten"]);
  });
  it("lässt ein falsch beantwortetes Lernziel offen, wenn der Test knapp besteht (1 Fehler bei 10 ist 90 %)", () => {
    const answers = [...many(9, (i) => a(`o${i}`, true, "sure")), a("falsch", false, "sure")];
    const e = evaluatePlacement(answers);
    expect(e.passed).toBe(true);
    expect(e.openObjectiveIds).toEqual(["falsch"]);
    expect(e.skipObjectiveIds).toHaveLength(9);
  });
  it("besteht nie ohne Antworten", () => {
    expect(evaluatePlacement([]).passed).toBe(false);
  });
});
