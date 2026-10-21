import { describe, expect, it } from "vitest";
import {
  chronoProfile, chronoStress, computePhi, imputeCheckin, isMonotoneCheckins, limitFactor, sortHardLast,
  targetRetention, timeStress, withoutOutliers,
} from "./state";

describe("Human State Engine", () => {
  it("Φ aus den Startgewichten", () => {
    // E=1 → 1.0·0.35, Budget 5 → 1.0·0.25, chrono 0.5·0.25, Arbeit 0.15 → 0.35+0.25+0.125+0.15
    expect(computePhi({ energyLevel: 1, timeBudgetMin: 5, hadWorkday: true }, 0.5)).toBeCloseTo(0.875, 5);
    expect(computePhi({ energyLevel: 5, timeBudgetMin: 30, hadWorkday: false }, 0)).toBe(0);
    expect(computePhi({ energyLevel: 1, timeBudgetMin: 5, hadWorkday: true }, 1)).toBe(1);
  });

  it("Zeitstress in Stufen", () => {
    expect([5, 10, 15, 20, 21].map(timeStress)).toEqual([1, 1, 0.5, 0.5, 0]);
  });

  it("r_target und Limit-Faktor folgen Φ", () => {
    expect(targetRetention(0)).toBeCloseTo(0.9);
    expect(targetRetention(1)).toBeCloseTo(0.75);
    expect(limitFactor(1)).toBeCloseTo(0.7);
  });

  it("Chronotyp: Rückfall ohne Daten, sonst Abweichung vom Bestwert", () => {
    expect(chronoStress(new Map(), 23)).toBe(0.5);
    expect(chronoStress(new Map(), 14)).toBe(0);
    const reviews = [
      ...Array.from({ length: 60 }, (_, i) => ({ localHour: 9, success: i < 54 })), // 90 %
      ...Array.from({ length: 60 }, (_, i) => ({ localHour: 21, success: i < 36 })), // 60 %
    ];
    const profile = chronoProfile(reviews);
    expect(chronoStress(profile, 9)).toBe(0);
    expect(chronoStress(profile, 21)).toBeCloseTo((0.9 - 0.6) / 0.9, 5);
    // Block mit zu wenig Daten → Rückfall
    expect(chronoStress(profile, 13)).toBe(0);
    expect(chronoStress(profile, 2)).toBe(0.5);
  });

  it("übersprungener Check-in: letzte Werte, sonst neutral, als imputed markiert", () => {
    expect(imputeCheckin({}, 10, null)).toEqual({
      imputed: true,
      values: { timeBudgetMin: 10, energyLevel: 3, hadWorkday: false },
    });
    expect(imputeCheckin({}, 5, { energyLevel: 2, hadWorkday: true }).values).toMatchObject({ energyLevel: 2, hadWorkday: true });
    expect(imputeCheckin({ energyLevel: 4, hadWorkday: false }, 5, null).imputed).toBe(false);
  });

  it("Ausreißer über 3 × Median werden ignoriert", () => {
    expect(withoutOutliers([10, 12, 11, 9, 200])).toEqual([10, 12, 11, 9]);
  });

  it("monotone Check-ins ab 10 identischen Sessions", () => {
    const same = Array.from({ length: 10 }, () => ({ energyLevel: 3, timeBudgetMin: 10, hadWorkday: true }));
    expect(isMonotoneCheckins(same)).toBe(true);
    expect(isMonotoneCheckins(same.slice(0, 9))).toBe(false);
    expect(isMonotoneCheckins([{ ...same[0], energyLevel: 4 }, ...same.slice(1)])).toBe(false);
  });

  it("schwere Karten nur bei hohem Φ nach hinten", () => {
    const items = [{ id: "a", difficulty: 9 }, { id: "b", difficulty: 2 }, { id: "c", difficulty: 8 }, { id: "d", difficulty: 3 }];
    expect(sortHardLast(items, 0.2).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortHardLast(items, 0.9).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });
});
