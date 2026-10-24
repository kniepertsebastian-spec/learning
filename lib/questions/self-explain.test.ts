import { describe, expect, it } from "vitest";
import { isSelfExplainType } from "./self-explain";

describe("isSelfExplainType", () => {
  it("nur Szenario- und Fehlersuche-Fragen", () => {
    expect(isSelfExplainType("scenario")).toBe(true);
    expect(isSelfExplainType("troubleshooting")).toBe(true);
    expect(isSelfExplainType("knowledge")).toBe(false);
    expect(isSelfExplainType(null)).toBe(false);
    expect(isSelfExplainType(undefined)).toBe(false);
  });
});
