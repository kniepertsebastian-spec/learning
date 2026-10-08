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
