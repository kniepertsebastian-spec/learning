import { describe, expect, it } from "vitest";
import { mulberry32 } from "./simulator";
import { calibrationHistory, computeCalibration, expectedSuccess, type ProbeObservation } from "./calibration";

function simulateUser(n: number, selfRating: number, passRate: number, seed: number): ProbeObservation[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    predictedR: 0.85, selfRating, populationRate: 0.75, success: rand() < passRate, timestamp: new Date(2026, 0, 1 + i),
  }));
}

describe("Kalibrierung", () => {
  it("erwarteter Erfolg kombiniert Selbst-Rating und Populationsquote", () => {
    expect(expectedSuccess({ predictedR: 0.8, selfRating: 4, populationRate: 0.75, success: true })).toBeCloseTo(0.85);
    expect(expectedSuccess({ predictedR: 0.8, selfRating: null, populationRate: null, success: true })).toBe(0.8);
  });

  it("erkennt Überschätzung („Easy“, aber nur 60 % bestanden) ab 30 Abfragen mit Konfidenzintervall über 0", () => {
    const value = computeCalibration(simulateUser(40, 4, 0.6, 7));
    expect(value.n).toBe(40);
    expect(value.bias).toBeGreaterThan(0.1);
    expect(value.ciLow).toBeGreaterThan(0);
    expect(value.status).toBe("overestimates");
  });

  it("stuft einen gut kalibrierten Nutzer nicht als überschätzend ein", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const value = computeCalibration(simulateUser(60, 3, 0.8, seed));
      expect(value.status).not.toBe("overestimates");
    }
  });

  it("vor 30 Abfragen: Schrumpfung Richtung Populationsmittel, keine belastbare Aussage", () => {
    const few = computeCalibration(simulateUser(10, 4, 0.2, 3));
    const raw = few.n; // 10
    expect(raw).toBe(10);
    expect(few.status).toBe("unknown");
    const many = computeCalibration(simulateUser(30, 4, 0.2, 3));
    expect(Math.abs(few.bias)).toBeLessThan(Math.abs(many.bias));
  });

  it("Unterschätzung wird erkannt", () => {
    const value = computeCalibration(simulateUser(50, 1, 0.95, 11));
    expect(value.status).toBe("underestimates");
    expect(value.bias).toBeLessThan(0);
  });

  it("liefert Brier-Score und einen Verlauf je Abfrage", () => {
    const obs = simulateUser(12, 3, 0.8, 5);
    expect(computeCalibration(obs).brier).toBeGreaterThanOrEqual(0);
    const history = calibrationHistory(obs);
    expect(history).toHaveLength(12);
    expect(history[11].n).toBe(12);
  });
});
