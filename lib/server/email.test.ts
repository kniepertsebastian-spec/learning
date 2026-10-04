import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("setzt Kleinschreibung und entfernt umgebende Leerzeichen", () => {
    expect(normalizeEmail("  Max.Muster@Example.COM ")).toBe("max.muster@example.com");
  });
});
