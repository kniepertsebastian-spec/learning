import { describe, expect, it } from "vitest";
import { needsMasteryReview } from "./service";

describe("needsMasteryReview", () => {
  it("ohne Lernende kein Befund (Schnitt 0 ist kein Messwert)", () => {
    expect(needsMasteryReview(0, 0)).toBe(false);
  });
  it("mit Lernenden unter 60 % ja, ab 60 % nein", () => {
    expect(needsMasteryReview(3, 59)).toBe(true);
    expect(needsMasteryReview(3, 60)).toBe(false);
    expect(needsMasteryReview(1, 0)).toBe(true);
  });
});
