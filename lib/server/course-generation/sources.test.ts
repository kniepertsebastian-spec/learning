import { describe, expect, it } from "vitest";
import { buildSourceReport } from "./coverage";
import { describeFetchError, fetchSourcesTolerant, noUsableSourceMessage, SourceFetchError, type FetchedSource } from "./sources";

function source(id: string, url: string, text = "x".repeat(500)): FetchedSource {
  return { id, title: url, url, retrievedAt: "2026-11-07T00:00:00.000Z", excerpts: [{ locator: "Abschnitt 1", text }], truncated: false };
}

describe("fetchSourcesTolerant", () => {
  it("verwendet die funktionierenden Quellen und meldet die kaputte, statt alles abzubrechen", async () => {
    const urls = ["https://a.example/1", "https://a.example/2", "https://a.example/3"];
    const fake = async (id: string, url: string) => {
      if (url.endsWith("/2")) throw new SourceFetchError("HTTP 404");
      return source(id, url);
    };
    const out = await fetchSourcesTolerant(urls, fake);
    expect(out.sources.map((s) => s.url)).toEqual([urls[0], urls[2]]);
    expect(out.skipped).toEqual([{ url: urls[1], error: "HTTP 404" }]);
  });

  it("vergibt die Kennung nach der Stelle in der Eingabe: sie bleibt stabil, wenn davor eine Quelle ausfällt", async () => {
    const urls = ["https://a.example/1", "https://a.example/2", "https://a.example/3"];
    const out = await fetchSourcesTolerant(urls, async (id, url) => {
      if (url.endsWith("/1")) throw new Error("kaputt");
      return source(id, url);
    });
    expect(out.sources.map((s) => s.id)).toEqual(["src-2", "src-3"]);
  });

  it("liefert keine Quellen und alle Gründe, wenn keine einzige funktioniert", async () => {
    const urls = ["https://a.example/1", "https://a.example/2"];
    const out = await fetchSourcesTolerant(urls, async (_id, url) => {
      throw new SourceFetchError(`nicht erreichbar: ${url}`);
    });
    expect(out.sources).toEqual([]);
    expect(out.skipped.map((s) => s.url)).toEqual(urls);
  });

  it("lässt alle Quellen durch, wenn nichts scheitert", async () => {
    const out = await fetchSourcesTolerant(["https://a.example/1"], async (id, url) => source(id, url));
    expect(out.skipped).toEqual([]);
    expect(out.sources).toHaveLength(1);
  });
});

describe("describeFetchError", () => {
  it("nimmt die Meldung des Fehlers, kürzt sie und fängt Nicht-Fehler ab", () => {
    expect(describeFetchError(new Error("Zeitüberschreitung"))).toBe("Zeitüberschreitung");
    expect(describeFetchError(new Error("x".repeat(500)))).toHaveLength(300);
    expect(describeFetchError("irgendwas")).toBe("Unbekannter Fehler beim Abruf.");
    expect(describeFetchError(new Error(""))).toBe("Unbekannter Fehler beim Abruf.");
  });
});

describe("noUsableSourceMessage", () => {
  it("nennt bei einer einzigen Quelle deren Grund unverändert", () => {
    expect(noUsableSourceMessage([{ url: "https://a.example/1", error: "HTTP 404" }])).toBe("HTTP 404");
  });

  it("listet bei mehreren die Adressen mit Grund und zählt den Rest", () => {
    const skipped = Array.from({ length: 7 }, (_, i) => ({ url: `https://a.example/${i}`, error: "HTTP 404" }));
    const message = noUsableSourceMessage(skipped);
    expect(message).toContain("Keine der 7 Quellen");
    expect(message).toContain("https://a.example/0: HTTP 404");
    expect(message).toContain("https://a.example/4: HTTP 404");
    expect(message).not.toContain("https://a.example/5");
    expect(message).toContain("und 2 weitere");
  });
});

describe("buildSourceReport mit übersprungenen Quellen", () => {
  it("vermerkt sie im Bericht und lässt das Feld weg, wenn nichts übersprungen wurde", () => {
    const skipped = [{ url: "https://a.example/2", error: "HTTP 404" }];
    const withSkipped = buildSourceReport([source("src-1", "https://a.example/1")], new Date("2026-11-07T00:00:00Z"), skipped);
    expect(withSkipped.skipped).toEqual(skipped);
    expect(withSkipped.sourceCount).toBe(1);
    expect("skipped" in buildSourceReport([source("src-1", "https://a.example/1")])).toBe(false);
  });
});
