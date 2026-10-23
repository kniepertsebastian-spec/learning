import { describe, expect, it } from "vitest";
import { PLATFORM_STAT_MIN_ANSWERS, platformStatText } from "./platform-stat";

describe("Plattformstatistik in Rückmeldungen", () => {
  it("ohne ausreichende Datenbasis keine Zahl", () => {
    expect(platformStatText(null, "de")).toBeNull();
    expect(platformStatText({ answers: PLATFORM_STAT_MIN_ANSWERS - 1, notSolved: 30 }, "de")).toBeNull();
    expect(platformStatText({ answers: 0, notSolved: 0 }, "en")).toBeNull();
  });

  it("ab der Schwelle: gerundet aus den echten Zahlen", () => {
    expect(platformStatText({ answers: 50, notSolved: 20 }, "de")).toContain("4 von 10 Lernenden");
    expect(platformStatText({ answers: 120, notSolved: 30 }, "en")).toContain("3 in 10 learners");
  });

  it("sagt nichts, wenn die Zahl nichts aussagt oder nicht zu den Daten passt", () => {
    expect(platformStatText({ answers: 100, notSolved: 0 }, "de")).toBeNull();
    expect(platformStatText({ answers: 100, notSolved: 100 }, "de")).toBeNull();
    expect(platformStatText({ answers: 100, notSolved: 101 }, "de")).toBeNull();
  });

  it("der Satz enthält nur die eine Zahl aus den Daten und keine Schuldzuweisung", () => {
    for (const locale of ["de", "en"] as const) {
      const text = platformStatText({ answers: 80, notSolved: 40 }, locale)!;
      expect(text.match(/\d+/g)).toEqual(["5", "10"]);
      expect(text).not.toMatch(/falsch|wrong|failed|versagt/i);
    }
  });
});
