import { describe, expect, it } from "vitest";
import { pickPretestQuestions } from "@/lib/lesson/pretest";

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));

describe("pickPretestQuestions", () => {
  it("wählt zwei verschiedene Fragen, stabil je Lektion", () => {
    const a = pickPretestQuestions(pool(6), "s1");
    expect(a).toHaveLength(2);
    expect(new Set(a.map((q) => q.id)).size).toBe(2);
    expect(pickPretestQuestions(pool(6), "s1")).toEqual(a);
    expect(pickPretestQuestions([...pool(6)].reverse(), "s1")).toEqual(a);
  });
  it("wählt je Lektion andere Fragen", () => {
    const picks = new Set(Array.from({ length: 20 }, (_, i) => pickPretestQuestions(pool(8), `s${i}`).map((q) => q.id).join()));
    expect(picks.size).toBeGreaterThan(3);
  });
  it("lässt bei zu kleinem Pool die Vorabfragen weg", () => {
    expect(pickPretestQuestions(pool(2), "s1")).toEqual([]);
    expect(pickPretestQuestions(pool(3), "s1")).toHaveLength(2);
  });
});
