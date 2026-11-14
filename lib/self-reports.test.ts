import { describe, expect, it } from "vitest";
import { SELF_REPORT_KINDS, SELF_REPORT_VALUES, isSelfReportKind, parseSelfReportValue } from "./self-reports";

describe("Selbstauskünfte: Arten und Werte (Aufgabe 17)", () => {
  it("jede Art hat erlaubte Werte", () => {
    for (const kind of SELF_REPORT_KINDS) expect(SELF_REPORT_VALUES[kind].length).toBeGreaterThan(1);
  });

  it("prüft und vereinheitlicht Werte je Art", () => {
    expect(parseSelfReportValue("effort", 3)).toBe("3");
    expect(parseSelfReportValue("effort", " 5 ")).toBe("5");
    expect(parseSelfReportValue("effort", 6)).toBeNull();
    expect(parseSelfReportValue("effort", 2.5)).toBeNull();
    expect(parseSelfReportValue("retention_forecast", 75)).toBe("75");
    expect(parseSelfReportValue("retention_forecast", 70)).toBeNull();
    expect(parseSelfReportValue("learning_reason", "interest")).toBe("interest");
    expect(parseSelfReportValue("learning_reason", "fun")).toBeNull();
    expect(parseSelfReportValue("learning_environment", null)).toBeNull();
    expect(parseSelfReportValue("work_relevance", { yes: true })).toBeNull();
  });

  it("erkennt Arten", () => {
    expect(isSelfReportKind("effort")).toBe(true);
    expect(isSelfReportKind("mood")).toBe(false);
    expect(isSelfReportKind(1)).toBe(false);
  });
});
