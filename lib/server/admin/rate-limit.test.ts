import { describe, expect, it } from "vitest";
import {
  checkCourseGenerationRateLimit,
  checkRemediationGenerationRateLimit,
  checkRemediationRegenerateCooldown,
} from "./rate-limit";

describe("remediation limits", () => {
  it("erlaubt eine Neugenerierung je Nutzer und Ziel, andere Ziele bleiben frei", () => {
    expect(checkRemediationRegenerateCooldown("u1", "o1").allowed).toBe(true);
    expect(checkRemediationRegenerateCooldown("u1", "o1").allowed).toBe(false);
    expect(checkRemediationRegenerateCooldown("u1", "o2").allowed).toBe(true);
  });

  it("begrenzt Generierungen auf 20 pro Tag und Nutzer", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRemediationGenerationRateLimit("u2").allowed).toBe(true);
    }
    expect(checkRemediationGenerationRateLimit("u2").allowed).toBe(false);
    expect(checkRemediationGenerationRateLimit("u3").allowed).toBe(true);
  });
});

describe("course generation limit", () => {
  it("erlaubt 5 Aufträge pro Stunde und Admin", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkCourseGenerationRateLimit("admin1").allowed).toBe(true);
    }
    expect(checkCourseGenerationRateLimit("admin1").allowed).toBe(false);
    expect(checkCourseGenerationRateLimit("admin2").allowed).toBe(true);
  });
});
