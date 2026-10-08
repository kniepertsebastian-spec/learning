import { describe, expect, it } from "vitest";
import { describeUrl, extractUrls } from "./extract-urls";

describe("extractUrls", () => {
  it("erkennt Adressen in einer Liste, Fließtext, Markdown und mit Komma getrennt", () => {
    const text = `Quellen:\nhttps://docs.aws.amazon.com/a/b.html\n- [Guide](https://docs.aws.amazon.com/guide.pdf), siehe auch http://example.org/x?y=1&z=2.\n"https://a.example/q" https://b.example/r,https://c.example/s`;
    expect(extractUrls(text)).toEqual([
      "https://docs.aws.amazon.com/a/b.html",
      "https://docs.aws.amazon.com/guide.pdf",
      "http://example.org/x?y=1&z=2",
      "https://a.example/q",
      "https://b.example/r",
      "https://c.example/s",
    ]);
  });
  it("entfernt Doppelte, behält Klammern, die zur Adresse gehören, und ignoriert Unbrauchbares", () => {
    expect(extractUrls("https://a.example/x https://a.example/x")).toEqual(["https://a.example/x"]);
    expect(extractUrls("(https://de.wikipedia.org/wiki/Foo_(Bar))")).toEqual(["https://de.wikipedia.org/wiki/Foo_(Bar)"]);
    expect(extractUrls("kein link, http://localhost/x, ftp://a.example/x, https://")).toEqual([]);
  });
});

describe("describeUrl", () => {
  it("zeigt Domain und letzten Pfadteil", () => {
    expect(describeUrl("https://www.docs.example.com/a/exam-guide.pdf")).toEqual({ host: "docs.example.com", path: "exam-guide.pdf" });
    expect(describeUrl("https://x.example/")).toEqual({ host: "x.example", path: "" });
  });
});
