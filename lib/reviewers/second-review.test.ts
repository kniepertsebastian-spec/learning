import { describe, expect, it } from "vitest";
import { pickSample, pickSecondReviewer, sampleSize, secondReviewShare } from "./second-review";

describe("Zweitprüfung: Auswahlregeln", () => {
  it("secondReviewShare: Standard 10 %, 0 schaltet ab, Ungültiges und Leeres gelten als nicht gesetzt", () => {
    expect(secondReviewShare(undefined)).toBe(0.1);
    expect(secondReviewShare("")).toBe(0.1);
    expect(secondReviewShare("0")).toBe(0);
    expect(secondReviewShare("0.25")).toBe(0.25);
    expect(secondReviewShare("1")).toBe(1);
    for (const bad of ["-1", "1.5", "abc", "NaN"]) expect(secondReviewShare(bad), bad).toBe(0.1);
  });

  it("sampleSize: Anteil aufgerundet, mindestens drei, höchstens 25, nie mehr als vorhanden", () => {
    expect(sampleSize(100, 0.1)).toBe(10);
    expect(sampleSize(101, 0.1)).toBe(11);
    expect(sampleSize(20, 0.1)).toBe(3); // Minimum
    expect(sampleSize(2, 0.1)).toBe(2); // weniger Fragen als das Minimum: alle
    expect(sampleSize(1000, 0.1)).toBe(25); // Obergrenze
    expect(sampleSize(0, 0.1)).toBe(0);
    expect(sampleSize(100, 0)).toBe(0); // abgeschaltet
    expect(sampleSize(10, 1)).toBe(10);
  });

  it("pickSample: gleiche Eingabe, gleiche Auswahl; andere Freigabe, andere Auswahl; keine Doppelten", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `q-${i}`);
    const a = pickSample("approval-1", ids, 8);
    expect(a).toHaveLength(8);
    expect(new Set(a).size).toBe(8);
    expect(pickSample("approval-1", [...ids].reverse(), 8)).toEqual(a); // unabhängig von der Reihenfolge der Eingabe
    expect(pickSample("approval-2", ids, 8)).not.toEqual(a);
    expect(pickSample("approval-1", ids, 0)).toEqual([]);
    expect(pickSample("approval-1", ids.slice(0, 3), 8)).toHaveLength(3);
  });

  it("pickSecondReviewer: nie der Freigebende, ohne Kandidaten niemand, stabil", () => {
    expect(pickSecondReviewer("a1", ["u1"], "u1")).toBeNull();
    expect(pickSecondReviewer("a1", [], null)).toBeNull();
    expect(pickSecondReviewer("a1", ["u1", "u2", "u3"], "u1")).not.toBe("u1");
    expect(pickSecondReviewer("a1", ["u1", "u2", "u3"], null)).toBe(pickSecondReviewer("a1", ["u3", "u2", "u1", "u2"], null));
  });
});
