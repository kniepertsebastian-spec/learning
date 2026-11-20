import { describe, expect, it } from "vitest";
import { inspectUpload } from "@/lib/server/documents/upload";
import { checkSourceFiles, toFetchedSource } from "./source-files";
import { markPrimaryAndCap, type FetchedSource } from "./sources";

const md = (text: string) => ({ filename: "leitfaden.md", mimeType: "text/markdown", data: Buffer.from(text, "utf-8") });

describe("Dateien als Quellen eines Betreiber-Auftrags", () => {
  it("Markdown wird in Abschnitte mit Dateinamen im Verweis zerlegt", async () => {
    const inspection = await inspectUpload(md(`# Domäne 1\n\n${"Netzwerkgrundlagen. ".repeat(30)}\n\n# Domäne 2\n\n${"Sicherheit. ".repeat(30)}`));
    if (!inspection.ok) throw new Error(inspection.message);
    const source = toFetchedSource("file-1", "leitfaden.md", inspection);
    expect(source.url).toBe("datei:leitfaden.md");
    expect(source.excerpts.length).toBeGreaterThan(0);
    expect(source.excerpts.every((e) => e.locator.startsWith("leitfaden.md · "))).toBe(true);
  });

  it("meldet eine Datei mit zu wenig Text oder falschem Typ", async () => {
    const problems = await checkSourceFiles([md("kurz"), { filename: "bild.png", mimeType: "image/png", data: Buffer.from([1, 2, 3]) }]);
    expect(problems.map((p) => p.filename)).toEqual(["leitfaden.md", "bild.png"]);
  });

  it("der Prüfungsleitfaden kann eine Datei sein: die Markierung wandert von der Adresse zur Datei", () => {
    const objectives = Array.from({ length: 12 }, (_, i) => `1.${i + 1} Lernziel ${i + 1}`).join("\n");
    const url: FetchedSource = { id: "src-1", title: "u", url: "https://a.example", retrievedAt: "", excerpts: [{ locator: "Abschnitt 1", text: "Text ohne Nummern. ".repeat(20) }], truncated: false, primary: true };
    const file: FetchedSource = { id: "file-1", title: "f", url: "datei:f.md", retrievedAt: "", excerpts: [{ locator: "f.md · Abschnitt 1", text: objectives }], truncated: false };
    const [u, f] = markPrimaryAndCap([url, file]);
    expect(u.primary).toBeUndefined();
    expect(f.primary).toBe(true);
  });
});
