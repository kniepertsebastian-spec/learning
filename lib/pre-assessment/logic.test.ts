import { describe, expect, it } from "vitest";
import { needsPreAssessment, pickPreAssessmentQuestions, PRE_ASSESSMENT_SIZE, summarizeByDomain } from "./logic";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const mk = (domainId: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${domainId}-${i}`, domainId }));
const dom = (id: string, orderNum: number, weight: number | null = null) => ({ id, orderNum, weight });

describe("Einstufungstest: Auswahl", () => {
  it("zieht genau 10 Fragen, breit über alle Kapitel gestreut", () => {
    const pool = [...mk("a", 20), ...mk("b", 20), ...mk("c", 20), ...mk("d", 20)];
    const picked = pickPreAssessmentQuestions(pool, [dom("a", 1), dom("b", 2), dom("c", 3), dom("d", 4)], { rng: seeded(1) });
    expect(picked).toHaveLength(PRE_ASSESSMENT_SIZE);
    const perDomain = ["a", "b", "c", "d"].map((d) => picked.filter((q) => q.domainId === d).length);
    expect(Math.min(...perDomain)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...perDomain) - Math.min(...perDomain)).toBeLessThanOrEqual(1);
    expect(new Set(picked.map((q) => q.id)).size).toBe(10);
  });
  it("jedes Kapitel kommt vor, sobald es höchstens 10 Kapitel gibt", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const picked = pickPreAssessmentQuestions(ids.flatMap((d) => mk(d, 5)), ids.map((d, i) => dom(d, i)), { rng: seeded(2) });
    expect(new Set(picked.map((q) => q.domainId)).size).toBe(7);
  });
  it("bei mehr als 10 Kapiteln fallen die am geringsten gewichteten weg", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `d${i}`);
    const picked = pickPreAssessmentQuestions(ids.flatMap((d) => mk(d, 3)), ids.map((d, i) => dom(d, i, i < 2 ? 1 : 50 - i)), { rng: seeded(3) });
    expect(picked).toHaveLength(10);
    const used = new Set(picked.map((q) => q.domainId));
    expect(used.has("d0")).toBe(false);
    expect(used.has("d1")).toBe(false);
  });
  it("kleine Pools: alle Fragen, leere Kapitel werden übersprungen", () => {
    const picked = pickPreAssessmentQuestions([...mk("a", 2), ...mk("b", 1)], [dom("a", 1), dom("b", 2), dom("leer", 3)], { rng: seeded(4) });
    expect(picked).toHaveLength(3);
  });
  it("fasst das Ergebnis je Kapitel zusammen", () => {
    const summary = summarizeByDomain(
      [{ domainId: "a", isCorrect: true }, { domainId: "a", isCorrect: false }, { domainId: "b", isCorrect: true }],
      [{ id: "a", name: "Netzwerk" }, { id: "b", name: "Sicherheit" }, { id: "c", name: "Ohne Fragen" }],
    );
    expect(summary).toEqual([{ domainId: "a", name: "Netzwerk", correct: 1, total: 2 }, { domainId: "b", name: "Sicherheit", correct: 1, total: 1 }]);
  });
});

describe("Einstufungstest: wann wird er angeboten", () => {
  const base = { hasRecord: false, hasProgress: false, testsEnabled: true, availableQuestions: 12 };
  it("einmalig vor dem ersten Kapitel", () => {
    expect(needsPreAssessment(base)).toBe(true);
    expect(needsPreAssessment({ ...base, hasRecord: true })).toBe(false); // gemacht oder übersprungen
    expect(needsPreAssessment({ ...base, hasProgress: true })).toBe(false); // schon im Kurs unterwegs
    expect(needsPreAssessment({ ...base, testsEnabled: false })).toBe(false);
    expect(needsPreAssessment({ ...base, availableQuestions: 0 })).toBe(false);
  });
});
