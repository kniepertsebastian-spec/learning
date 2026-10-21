import { describe, expect, it } from "vitest";
import { buildSourceReport, compareCoverage, detectExamVersions, extractOfficialObjectives, normalizeCode } from "./coverage";
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
});

describe("Abdeckung", () => {
  const official = [{ code: "1.1", title: "A" }, { code: "1.2", title: "B" }, { code: "2.1", title: "C" }, { code: "2.2", title: "D" }];
  it("meldet fehlende und zusätzliche Lernziele", () => {
    expect(compareCoverage(official, ["1.1", "2.1", "2.2", "9.9"])).toEqual({ status: "ok", recognised: 4, covered: ["1.1", "2.1", "2.2"], missing: [{ code: "1.2", title: "B" }], extra: ["9.9"] });
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
});

describe("Prüfungsversionen erkennen", () => {
  it("Prüfungscodes und Versionsangaben", () => {
    expect(detectExamVersions("CompTIA Security+ SY0-701 Exam Objectives, Version 5.0 – AZ-104 later")).toEqual(["SY0-701", "AZ-104", "Version 5.0"]);
    expect(detectExamVersions("Ganz normaler Text ohne Codes")).toEqual([]);
  });
});
