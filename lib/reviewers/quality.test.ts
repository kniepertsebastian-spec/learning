import { describe, expect, it } from "vitest";
import { DEFAULT_QUALITY_FACTOR, isNoticeable, per100, qualityFactor, ratioToAverage } from "./quality";

describe("Prüfer-Qualität: Rechenregeln", () => {
  it("per100 und Verhältnis zum Durchschnitt", () => {
    expect(per100(6, 120)).toBe(5);
    expect(per100(3, 0)).toBe(0);
    expect(ratioToAverage(10, 5)).toBe(2);
    expect(ratioToAverage(10, 0)).toBeNull();
  });

  it("qualityFactor: Zahl über 1 bis 20, sonst der Standard; leer gilt als nicht gesetzt", () => {
    expect(qualityFactor(undefined)).toBe(DEFAULT_QUALITY_FACTOR);
    expect(qualityFactor("")).toBe(DEFAULT_QUALITY_FACTOR);
    expect(qualityFactor("   ")).toBe(DEFAULT_QUALITY_FACTOR);
    expect(qualityFactor("3")).toBe(3);
    expect(qualityFactor("1.5")).toBe(1.5);
    for (const bad of ["1", "0", "-2", "21", "abc", "NaN"]) expect(qualityFactor(bad), bad).toBe(DEFAULT_QUALITY_FACTOR);
  });

  it("isNoticeable: nur deutlich über dem Durchschnitt und nur mit genug Daten", () => {
    // Durchschnitt 2 je 100 Fragen, Schwelle Faktor 2 → ab 4 je 100.
    expect(isNoticeable({ events: 10, questions: 200 }, 2)).toBe(true); // 5 je 100
    expect(isNoticeable({ events: 8, questions: 200 }, 2)).toBe(true); // genau 4 je 100
    expect(isNoticeable({ events: 7, questions: 200 }, 2)).toBe(false); // 3,5 je 100
    expect(isNoticeable({ events: 4, questions: 40 }, 2)).toBe(false); // zu wenige Ereignisse
    expect(isNoticeable({ events: 6, questions: 10 }, 2)).toBe(false); // zu wenige Fragen
    expect(isNoticeable({ events: 10, questions: 200 }, 0)).toBe(false); // kein Durchschnitt
    expect(isNoticeable({ events: 7, questions: 200 }, 2, 1.5)).toBe(true); // niedrigere Schwelle
  });
});
