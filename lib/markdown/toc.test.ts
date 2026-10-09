import { describe, expect, it } from "vitest";
import { extractToc, isHandsOn, readingMinutes, slugify } from "./toc";

describe("extractToc", () => {
  it("nimmt nur H2, mit eindeutigen Ankern, ohne Codeblöcke", () => {
    const md = "# Titel\n\n## Erste Schritte\n\ntext\n\n```bash\n## kein Heading\n```\n\n### Unterpunkt\n\n## Erste Schritte\n\n## Über `kubectl` & Co.\n";
    expect(extractToc(md)).toEqual([
      { id: "erste-schritte", text: "Erste Schritte" },
      { id: "erste-schritte-2", text: "Erste Schritte" },
      { id: "uber-kubectl-co", text: "Über kubectl & Co." },
    ]);
  });
  it("slugify behält Zahlen und fällt nie auf leer zurück", () => {
    expect(slugify("3. Netzwerk")).toBe("3-netzwerk");
    expect(slugify("???")).toBe("abschnitt");
  });
});

describe("isHandsOn / readingMinutes", () => {
  it("erkennt Praxisbeispiel und Terminal", () => {
    expect(isHandsOn(":::practice\n### Szenario\n")).toBe(true);
    expect(isHandsOn("```console\n$ ls\n```")).toBe(true);
    expect(isHandsOn("```bash\nls\n```\nnur Text")).toBe(false);
  });
  it("Lesezeit mindestens 1 Minute", () => {
    expect(readingMinutes("kurz")).toBe(1);
    expect(readingMinutes(Array(600).fill("wort").join(" "))).toBe(3);
  });
});
