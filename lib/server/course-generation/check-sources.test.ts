import { describe, expect, it } from "vitest";
import { checkSources } from "./check-sources";
import { SourceFetchError } from "./sources";

describe("checkSources", () => {
  it("meldet je Adresse ok oder den Fehler, in der Eingabereihenfolge, auch bei mehr Adressen als Parallelität", async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://a.example/${i}`);
    const fake = async (_id: string, url: string) => {
      if (url.endsWith("/3")) throw new SourceFetchError("HTTP 404");
      if (url.endsWith("/7")) throw new Error("Zeitüberschreitung");
      return {} as never;
    };
    const out = await checkSources(urls, fake);
    expect(out.map((r) => r.url)).toEqual(urls);
    expect(out.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.error))).toEqual(["HTTP 404", "Zeitüberschreitung"]);
    expect(out.filter((r) => r.ok)).toHaveLength(10);
  });
});

describe("checkSources mit Frist", () => {
  it("meldet nicht rechtzeitig fertige Quellen als ungeprüft statt die Anfrage hängen zu lassen", async () => {
    const urls = ["https://a.example/schnell", "https://a.example/langsam"];
    const fake = (_id: string, url: string) =>
      url.endsWith("langsam") ? new Promise<never>(() => {}) : Promise.resolve({} as never);
    const out = await checkSources(urls, fake, 50);
    expect(out).toEqual([
      { url: urls[0], ok: true },
      { url: urls[1], ok: true, unchecked: true },
    ]);
  });
});
