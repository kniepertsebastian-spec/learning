import { describe, expect, it } from "vitest";
import { cleanCompanyName, isCompanyEmail } from "./claims";

describe("isCompanyEmail", () => {
  it("akzeptiert eigene Firmen-Domains", () => {
    expect(isCompanyEmail("anna@certstudy.de")).toBe(true);
    expect(isCompanyEmail("  Anna@Firma.CO.UK ")).toBe(true);
  });
  it("lehnt private Anbieter und Unsinn ab", () => {
    expect(isCompanyEmail("anna@gmail.com")).toBe(false);
    expect(isCompanyEmail("Anna@GMX.de")).toBe(false);
    expect(isCompanyEmail("anna@localhost")).toBe(false);
    expect(isCompanyEmail("anna")).toBe(false);
  });
});

describe("cleanCompanyName", () => {
  it("normalisiert Leerraum und entfernt Steuerzeichen", () => {
    expect(cleanCompanyName("  Cert \n Study\u0000 GmbH ")).toBe("Cert Study GmbH");
    expect(cleanCompanyName("   ")).toBe("");
  });
  it("kürzt auf 120 Zeichen", () => {
    expect(cleanCompanyName("x".repeat(300))).toHaveLength(120);
  });
});
