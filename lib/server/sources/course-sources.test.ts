import { describe, expect, it } from "vitest";
import { mergeSources, safeUrl } from "./course-sources";

describe("Quellen & Fachliteratur", () => {
  it("nur Web-Adressen werden verlinkt", () => {
    expect(safeUrl("https://example.org/a")).toBe("https://example.org/a");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("kein link")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
  it("dieselbe Quelle kommt nur einmal vor, die mit mehr Angaben gewinnt; sortiert nach Titel", () => {
    const merged = mergeSources([
      { title: "example.org", provider: null, url: "https://example.org/guide", version: null, publishedAt: null },
      { title: "Prüfungsleitfaden", provider: "Anbieter", url: "https://example.org/guide/", version: "7.0", publishedAt: "2024-05-01T00:00:00.000Z" },
      { title: "Buch", provider: "Verlag", url: null, version: "2. Aufl.", publishedAt: null },
    ]);
    expect(merged.map((m) => m.title)).toEqual(["Buch", "Prüfungsleitfaden"]);
    expect(merged[1]).toMatchObject({ provider: "Anbieter", version: "7.0" });
  });
});
