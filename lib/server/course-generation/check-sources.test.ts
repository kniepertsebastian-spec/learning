import { describe, expect, it } from "vitest";
import { checkSources } from "./check-sources";
import { FULL_CONTEXT_MAX_CHARS, MAX_EXCERPT_CHARS_PER_SOURCE, PRIMARY_SOURCE_MAX_CHARS, SourceFetchError, type FetchedSource } from "./sources";

const fetched = (url: string, text: string, truncated = false): FetchedSource => ({ id: url, title: url, url, retrievedAt: "", excerpts: [{ locator: "S. 1", text }], truncated });
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `${Math.floor(i / 5) + 1}.${(i % 5) + 1} Configure the component number ${i + 1}`).join("\n");

describe("checkSources", () => {
  it("meldet je Adresse ok oder den Fehler, in der Eingabereihenfolge, auch bei mehr Adressen als Parallelität", async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://a.example/${i}`);
    const fake = async (_id: string, url: string) => {
      if (url.endsWith("/3")) throw new SourceFetchError("HTTP 404");
      if (url.endsWith("/7")) throw new Error("Zeitüberschreitung");
      return fetched(url, "Text ".repeat(100));
    };
    const { results } = await checkSources(urls, fake);
    expect(results.map((r) => r.url)).toEqual(urls);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.error))).toEqual(["HTTP 404", "Zeitüberschreitung"]);
    expect(results.filter((r) => r.ok)).toHaveLength(10);
  });

  it("liest jede Quelle voll (bis zur Grenze des Leitfadens), damit die Kürzung richtig berechnet wird", async () => {
    const limits: number[] = [];
    await checkSources(["https://a.example/x"], async (_id, url, maxChars) => {
      limits.push(maxChars ?? -1);
      return fetched(url, "Text ".repeat(100));
    });
    expect(limits).toEqual([PRIMARY_SOURCE_MAX_CHARS]);
  });
});

describe("checkSources: Zeichen und Budget (Quellen-Roadmap AP-3.3)", () => {
  it("nennt Zeichen, Kürzung und Leitfaden je Quelle und die Summe gegen das Budget", async () => {
    const texts: Record<string, string> = {
      "https://a.example/guide": numbered(10),
      "https://a.example/small": "s".repeat(10_000),
      "https://a.example/huge": "h".repeat(MAX_EXCERPT_CHARS_PER_SOURCE + 5_000),
    };
    const { results, budget } = await checkSources(Object.keys(texts), async (_id, url) => fetched(url, texts[url]));
    const [guide, small, huge] = results;
    expect(guide).toMatchObject({ ok: true, primary: true, willTruncate: false });
    expect(small).toMatchObject({ ok: true, chars: 10_000, keptChars: 10_000, willTruncate: false });
    expect(small).not.toHaveProperty("primary");
    expect(huge).toMatchObject({ ok: true, chars: MAX_EXCERPT_CHARS_PER_SOURCE + 5_000, keptChars: MAX_EXCERPT_CHARS_PER_SOURCE, willTruncate: true });
    expect(budget).toEqual({
      totalChars: texts["https://a.example/guide"].length + 10_000 + MAX_EXCERPT_CHARS_PER_SOURCE,
      budgetChars: FULL_CONTEXT_MAX_CHARS,
      primaryUrl: "https://a.example/guide",
      unchecked: 0,
    });
  });

  it("die markierte Quelle ist der Leitfaden; schon beim Abruf gekürzte Quellen gelten als gekürzt", async () => {
    const { results, budget } = await checkSources(
      ["https://a.example/guide", "https://a.example/marked"],
      async (_id, url) => (url.endsWith("guide") ? fetched(url, numbered(10)) : fetched(url, "m".repeat(1_000), true)),
      undefined,
      "https://a.example/marked",
    );
    expect(results[1]).toMatchObject({ primary: true, willTruncate: true });
    expect(results[0]).not.toHaveProperty("primary");
    expect(budget.primaryUrl).toBe("https://a.example/marked");
  });
});

describe("checkSources mit Frist", () => {
  it("meldet nicht rechtzeitig fertige Quellen als ungeprüft statt die Anfrage hängen zu lassen", async () => {
    const urls = ["https://a.example/schnell", "https://a.example/langsam"];
    const fake = (_id: string, url: string) => (url.endsWith("langsam") ? new Promise<never>(() => {}) : Promise.resolve(fetched(url, "Text")));
    const { results, budget } = await checkSources(urls, fake, 50);
    expect(results).toEqual([
      { url: urls[0], ok: true, chars: 4, keptChars: 4, willTruncate: false },
      { url: urls[1], ok: true, unchecked: true },
    ]);
    expect(budget.unchecked).toBe(1);
  });
});
