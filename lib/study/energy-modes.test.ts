import { describe, expect, it } from "vitest";
import { alternativeHref, ENERGY_ALTERNATIVES, offerEnergyAlternatives } from "./energy-modes";

describe("Aufgabenart nach Energie", () => {
  it("bei Energie 1-2 oder in der Entlastung, nur mit Flag", () => {
    expect(offerEnergyAlternatives({ enabled: true, energy: 1, deescalated: false })).toBe(true);
    expect(offerEnergyAlternatives({ enabled: true, energy: 2, deescalated: false })).toBe(true);
    expect(offerEnergyAlternatives({ enabled: true, energy: 3, deescalated: false })).toBe(false);
    expect(offerEnergyAlternatives({ enabled: true, energy: null, deescalated: false })).toBe(false);
    expect(offerEnergyAlternatives({ enabled: true, energy: null, deescalated: true })).toBe(true);
    expect(offerEnergyAlternatives({ enabled: false, energy: 1, deescalated: true })).toBe(false);
  });
  it("mindestens drei Alternativen, Simulation und Spickzettel führen auf die Kursseiten", () => {
    expect(ENERGY_ALTERNATIVES.length).toBeGreaterThanOrEqual(3);
    expect(alternativeHref("simulation", "x")).toBe("/cert/x/simulations");
    expect(alternativeHref("cheat_sheet", "x")).toBe("/cert/x/cheatsheets");
    expect(alternativeHref("reviews_only", "x")).toBeNull();
  });
});
