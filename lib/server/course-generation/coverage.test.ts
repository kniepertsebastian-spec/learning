import { describe, expect, it } from "vitest";
import { buildSourceReport, compareCoverage, detectExamVersions, expandCourseCode, extractOfficialObjectives, normalizeCode } from "./coverage";
import { capExcerpts, primarySourceIndex, PRIMARY_SOURCE_MAX_CHARS } from "./sources";

const guide = (text: string) => [{ text }];

describe("offizielle Lernziele erkennen", () => {
  it("CompTIA-, AWS- und LPI-Schreibweisen", () => {
    const text = [
      "CompTIA Security+ Exam Objectives",
      "1.1 Compare and contrast various types of security controls.",
      "1.2 Summarize fundamental security concepts.",
      "Objective 2.3 Explain various types of vulnerabilities",
      "Task Statement 3.1: Design secure access to AWS resources",
      "101.1 Determine and configure hardware settings",
      "1.2.1 Unterpunkt wird nicht als eigenes Lernziel gezählt",
    ].join("\n");
    expect(extractOfficialObjectives(guide(text)).map((o) => o.code)).toEqual(["1.1", "1.2", "2.3", "3.1", "101.1"]);
  });
  it("Zahlen im Fließtext sind keine Lernziele", () => {
    const text = ["Der Prozessor taktet mit 3.2 GHz und kostet 2.5 Euro.", "Siehe Abb. 4.1 Netzwerkplan", "Version 3.1 Release Notes", "12.5 % der Prüfung", "Seite 1.2 Inhalt"].join("\n");
    expect(extractOfficialObjectives(guide(text))).toEqual([]);
  });
  it("Markdown-Zeichen, doppelte Codes (längster Titel), Reihenfolge numerisch", () => {
    const text = ["**10.1** Plan the architecture of the whole system", "## 2.1 Short", "2.1 Short title with more words", "- 9.2 Operate things"].join("\n");
    const r = extractOfficialObjectives(guide(text));
    expect(r.map((o) => o.code)).toEqual(["2.1", "9.2", "10.1"]);
    expect(r[0].title).toBe("Short title with more words");
  });
  it("Codes vereinheitlichen", () => {
    expect(normalizeCode("01.02")).toBe("1.2");
    expect(normalizeCode("Objective 3.4")).toBe("3.4");
  });
  it("Kurzzeichen, römische Ziffern und Unlesbares: nie „NaN“ (PWA-Review 28.11.2026, m-05)", () => {
    expect(normalizeCode("KF 4.4.0")).toBe("4.4.0");
    expect(normalizeCode("LO-2.1")).toBe("2.1");
    expect(normalizeCode("K2 1.3")).toBe("1.3");
    expect(normalizeCode("II.3")).toBe("2.3");
    expect(normalizeCode("IV")).toBe("4");
    expect(normalizeCode("Lernziel III.1")).toBe("3.1");
    expect(normalizeCode("Objective")).toBe("");
    expect(normalizeCode("5.x")).toBe("");
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode("Teil A")).toBe("");
  });
});

describe("Lernziel-Codes des Kurses auflösen", () => {
  it("Bindestrich- und Gedankenstrich-Bereiche", () => {
    expect(expandCourseCode("5.1–5.7")).toEqual(["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"]);
    expect(expandCourseCode("5.1-5.3")).toEqual(["5.1", "5.2", "5.3"]);
    expect(expandCourseCode("5.1 – 5.3")).toEqual(["5.1", "5.2", "5.3"]);
    expect(expandCourseCode("5.1-3")).toEqual(["5.1", "5.2", "5.3"]);
    expect(expandCourseCode("2.1 bis 2.2")).toEqual(["2.1", "2.2"]);
    expect(expandCourseCode("III–V")).toEqual(["3", "4", "5"]);
  });
  it("ungewöhnliche Bereiche lösen nur die Enden auf", () => {
    expect(expandCourseCode("5.7–5.1")).toEqual(["5.7", "5.1"]);
    expect(expandCourseCode("4.1–5.2")).toEqual(["4.1", "5.2"]);
    expect(expandCourseCode("1.1–1.99")).toEqual(["1.1", "1.99"]);
  });
  it("Einzelcodes mit Kurzzeichen und Unlesbares", () => {
    expect(expandCourseCode("KF 4.4.0")).toEqual(["4.4.0"]);
    expect(expandCourseCode("LO-2.1")).toEqual(["2.1"]);
    expect(expandCourseCode("1.2")).toEqual(["1.2"]);
    expect(expandCourseCode("Einführung")).toEqual([]);
    expect(expandCourseCode("")).toEqual([]);
  });
});

describe("Abdeckung", () => {
  const official = [{ code: "1.1", title: "A" }, { code: "1.2", title: "B" }, { code: "2.1", title: "C" }, { code: "2.2", title: "D" }];
  it("meldet fehlende und zusätzliche Lernziele", () => {
    expect(compareCoverage(official, ["1.1", "2.1", "2.2", "9.9"])).toEqual({ status: "ok", recognised: 4, covered: ["1.1", "2.1", "2.2"], missing: [{ code: "1.2", title: "B" }], extra: ["9.9"] });
  });
  it("Bereiche decken ab, unlesbare Codes erscheinen nie als NaN", () => {
    const result = compareCoverage(official, ["1.1–1.2", "KF 2.1", "II.2", "Einführung", "5.1–5.3"]);
    expect(result).toEqual({ status: "ok", recognised: 4, covered: ["1.1", "1.2", "2.1", "2.2"], missing: [], extra: ["5.1", "5.2", "5.3"] });
    expect(JSON.stringify(result)).not.toContain("NaN");
  });
  it("zu wenige erkannte Nummern: keine Aussage statt einer falschen", () => {
    expect(compareCoverage(official.slice(0, 2), ["1.1"])).toEqual({ status: "not_numbered", recognised: 2 });
  });
});

describe("Prüfungsleitfaden als Hauptquelle", () => {
  const numbered = (n: number) => Array.from({ length: n }, (_, i) => `${Math.floor(i / 5) + 1}.${(i % 5) + 1} Configure the component number ${i + 1}`).join("\n");
  it("die Quelle mit den meisten nummerierten Lernzielen; ohne Nummern keine", () => {
    expect(primarySourceIndex([{ excerpts: [{ locator: "a", text: "Fließtext ohne Nummern" }] }, { excerpts: [{ locator: "b", text: numbered(12) }] }, { excerpts: [{ locator: "c", text: numbered(4) }] }])).toBe(1);
    expect(primarySourceIndex([{ excerpts: [{ locator: "a", text: "1.1 Nur eins" }] }])).toBe(-1);
  });
  it("die Hauptquelle wird nicht auf 60.000 Zeichen gekürzt, die übrigen schon", () => {
    const long = [{ locator: "S. 1", text: "x".repeat(150_000) }];
    expect(capExcerpts(long).truncated).toBe(true);
    expect(capExcerpts(long, PRIMARY_SOURCE_MAX_CHARS).truncated).toBe(false);
    const sources = [{ id: "1", title: "Guide", url: "u", retrievedAt: "", excerpts: long, truncated: false, primary: true }];
    expect(buildSourceReport(sources).primary).toEqual({ title: "Guide", url: "u" });
  });
  it("Lernziele nur aus dem Leitfaden, nicht aus Didaktik- oder Fachunterlagen (PWA-Review 28.11.2026, m-05)", () => {
    const source = (id: string, text: string, primary = false) => ({ id, title: id, url: id, retrievedAt: "", excerpts: [{ locator: "S. 1", text }], truncated: false, ...(primary ? { primary: true } : {}) });
    const blueprint = source("Blueprint", numbered(6), true);
    const handout = source("Prüferhandreichung", ["7.3 Feedback geben im Gespräch", "7.4 Bewertungsbogen ausfüllen", "7.9 Abschluss der Prüfung"].join("\n"));
    const codes = buildSourceReport([handout, blueprint]).officialObjectives.map((o) => o.code);
    expect(codes).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5", "2.1"]);
    // Ohne erkannten Leitfaden zählen weiterhin alle Quellen.
    expect(buildSourceReport([handout, { ...blueprint, primary: undefined }]).officialObjectives.map((o) => o.code)).toContain("7.3");
  });
});

describe("Prüfungsversionen erkennen", () => {
  it("Prüfungscodes und Versionsangaben", () => {
    expect(detectExamVersions("CompTIA Security+ SY0-701 Exam Objectives, Version 5.0 – AZ-104 later")).toEqual(["SY0-701", "AZ-104", "Version 5.0"]);
    expect(detectExamVersions("Ganz normaler Text ohne Codes")).toEqual([]);
  });
});
