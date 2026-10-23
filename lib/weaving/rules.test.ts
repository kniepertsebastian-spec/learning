import { describe, expect, it } from "vitest";
import { interleave, isWeakOrDue, rankCandidates, wovenCount, type WovenCandidate } from "./rules";

const now = new Date("2026-10-23T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("wovenCount", () => {
  it("höchstens 2 und etwa 20 %, bei kleinen Tests mindestens eine", () => {
    expect(wovenCount(3, 5)).toBe(1);
    expect(wovenCount(5, 5)).toBe(1);
    expect(wovenCount(10, 5)).toBe(2);
    expect(wovenCount(30, 5)).toBe(2);
  });
  it("nie mehr als vorhanden, nichts ohne Test oder Kandidaten", () => {
    expect(wovenCount(10, 1)).toBe(1);
    expect(wovenCount(10, 0)).toBe(0);
    expect(wovenCount(0, 3)).toBe(0);
  });
});

describe("isWeakOrDue", () => {
  it("fällig oder niedrige Abrufwahrscheinlichkeit", () => {
    expect(isWeakOrDue({ due: day(-1), retrievability: 0.95 }, now)).toBe(true);
    expect(isWeakOrDue({ due: day(5), retrievability: 0.7 }, now)).toBe(true);
    expect(isWeakOrDue({ due: day(5), retrievability: 0.9 }, now)).toBe(false);
    expect(isWeakOrDue({ due: day(5), retrievability: null }, now)).toBe(false);
  });
});

describe("rankCandidates", () => {
  const c = (itemId: string, tier: 1 | 2, r: number | null, dueDay = 0): WovenCandidate => ({ itemId, tier, retrievability: r, due: day(dueDay) });
  it("engerer Bezug zuerst, dann schwächste Abrufwahrscheinlichkeit, dann früheste Fälligkeit", () => {
    const ranked = rankCandidates([c("b", 2, 0.1), c("a", 1, 0.7), c("c", 1, 0.5), c("d", 1, 0.5, -3)]);
    expect(ranked.map((x) => x.itemId)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("interleave", () => {
  it("beginnt immer mit einer regulären Frage und behält deren Reihenfolge", () => {
    const out = interleave(["r1", "r2", "r3", "r4", "r5"], ["w1", "w2"]);
    expect(out[0]).toBe("r1");
    expect(out.filter((x) => x.startsWith("r"))).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(out).toHaveLength(7);
    expect(out.indexOf("w1")).toBeLessThan(out.indexOf("w2"));
  });
  it("ohne eingewebte oder reguläre Fragen unverändert", () => {
    expect(interleave(["r1", "r2"], [])).toEqual(["r1", "r2"]);
    expect(interleave([], ["w1"])).toEqual([]);
  });
});
