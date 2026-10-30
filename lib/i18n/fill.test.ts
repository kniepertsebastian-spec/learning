import { describe, expect, it } from "vitest";
import { fill } from "./fill";

describe("fill", () => {
  it("setzt Werte wie ein Template-Literal ein, auch in anderer Reihenfolge", () => {
    expect(fill("{0} von {1} richtig", 3, 5)).toBe("3 von 5 richtig");
    expect(fill("{1} of {0}", 5, 3)).toBe("3 of 5");
    expect(fill("Wert: {0}", null)).toBe(`Wert: ${null}`);
    expect(fill("ohne {2}", 1)).toBe("ohne {2}");
  });
});
