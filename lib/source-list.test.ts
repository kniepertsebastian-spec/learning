import { describe, expect, it } from "vitest";
import { parseSourceList, titleFromFileName, titleFromUrl } from "./source-list";

describe("parseSourceList", () => {
  it("liest eine Adresse je Zeile, ignoriert Leeres und Kommentare", () => {
    const r = parseSourceList("# Quellen\n\nhttps://example.org/a/exam-guide.pdf\n  https://example.org/b  \n");
    expect(r.items).toEqual([
      { title: "exam-guide", url: "https://example.org/a/exam-guide.pdf" },
      { title: "b", url: "https://example.org/b" },
    ]);
    expect(r.invalid).toEqual([]);
  });

  it("versteht „Titel | URL“, „URL | Titel“ und „URL Titel“", () => {
    const r = parseSourceList("Prüfungsleitfaden | https://example.org/x.pdf\nhttps://example.org/y.pdf | Handbuch\nhttps://example.org/z Zusatzmaterial 2");
    expect(r.items.map((i) => i.title)).toEqual(["Prüfungsleitfaden", "Handbuch", "Zusatzmaterial 2"]);
  });

  it("meldet ungültige Zeilen und zählt doppelte Adressen nur einmal", () => {
    const r = parseSourceList("kein link\nftp://example.org/a.pdf\nhttps://example.org/a.pdf\nhttps://example.org/a.pdf#seite2\n");
    expect(r.items).toHaveLength(1);
    expect(r.invalid).toEqual(["kein link", "ftp://example.org/a.pdf"]);
    expect(r.duplicates).toBe(1);
  });

  it("leitet Titel aus Adresse und Dateiname ab", () => {
    expect(titleFromUrl("https://www.example.org/")).toBe("example.org");
    expect(titleFromUrl("https://example.org/files/SY0-701_Objectives%20v2.pdf")).toBe("SY0-701 Objectives v2");
    expect(titleFromFileName("Exam_Guide-2026.PDF")).toBe("Exam Guide-2026");
  });
});
