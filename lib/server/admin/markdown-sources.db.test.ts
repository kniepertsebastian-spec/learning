/** Markdown-Quellen: hochladen, in Abschnitte auslesen, nachträglich bearbeiten (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { blueprintDrafts, certificationSources, certifications } from "@/lib/server/db/schema";
import { extractSourceContent } from "./source-extraction";
import {
  getCertificationSource,
  getSourcePages,
  listCertificationSources,
  readMarkdownSource,
  registerCertificationSourceMarkdown,
  SourceEditError,
  updateMarkdownSource,
} from "./sources";

const run = TEST_DB ? describe : describe.skip;

const paragraph = (n: number) => `${"Satz ".repeat(120)}Absatz ${n}.`;
/** Lang genug für mehrere Abschnitte (Überschriften ab 800 Zeichen, höchstens 6.000 je Abschnitt). */
const longDocument = () =>
  Array.from({ length: 4 }, (_, i) => `## Kapitel ${i + 1}\n\n${paragraph(i * 3 + 1)}\n\n${paragraph(i * 3 + 2)}\n\n${paragraph(i * 3 + 3)}`).join("\n\n");

let storageDir: string;
let certId: string;

async function register(text: string, title = "Leitfaden") {
  return registerCertificationSourceMarkdown({ certificationId: certId, title, provider: "Test", publishedAt: null, data: Buffer.from(text, "utf-8") });
}

run("Markdown-Quellen (DB)", () => {
  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), "md-sources-"));
    process.env.SOURCES_STORAGE_DIR = storageDir;
    const tag = randomUUID().slice(0, 8);
    const [cert] = await getDb().insert(certifications).values({ slug: `md-${tag}`, name: `MD ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning();
    certId = cert.id;
  });

  afterAll(async () => {
    if (certId) await getDb().delete(certifications).where(eq(certifications.id, certId));
    await rm(storageDir, { recursive: true, force: true });
  });

  it("legt eine Markdown-Quelle an, erkennt denselben Inhalt wieder und liest ihn in Abschnitte aus", async () => {
    const text = longDocument();
    const first = await register(text, "Lang");
    expect(first.alreadyExisted).toBe(false);
    expect(first.source).toMatchObject({ sourceType: "markdown", mimeType: "text/markdown", status: "uploaded" });
    expect((await register(text, "Noch mal")).alreadyExisted).toBe(true);

    await extractSourceContent(first.source.id);
    const parsed = await getCertificationSource(first.source.id);
    expect(parsed?.status).toBe("parsed");
    const pages = await getSourcePages(first.source.id);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((p) => p.pageNumber)).toEqual(pages.map((_, i) => i + 1));
    expect(pages.map((p) => p.content).join("\n")).toContain("Absatz 12.");
    const listed = (await listCertificationSources(certId)).find((s) => s.id === first.source.id);
    expect(listed?.chunkCount).toBe(pages.length);
  });

  it("liefert den gespeicherten Text mit vereinheitlichten Zeilenenden zum Bearbeiten", async () => {
    const { source } = await register("# Titel\r\n\r\nZeile eins\r\nZeile zwei", "Windows");
    const read = await readMarkdownSource(source.id);
    expect(read.content).toBe("# Titel\n\nZeile eins\nZeile zwei");
    expect(read.editable).toBe(true);
  });

  it("ändert den Text: neue Checksumme, Status zurück auf hochgeladen, nach dem Auslesen keine übrigen Abschnitte", async () => {
    const { source } = await register(longDocument().replace("Kapitel 1", "Kapitel Eins"), "Wird kürzer");
    await extractSourceContent(source.id);
    const before = await getSourcePages(source.id);
    expect(before.length).toBeGreaterThan(1);

    const result = await updateMarkdownSource({ sourceId: source.id, content: "# Neu\n\nNur noch ein kurzer Absatz." });
    expect(result.contentChanged).toBe(true);
    expect(result.blueprintDraftExists).toBe(false);
    expect(result.source.status).toBe("uploaded");
    expect(result.source.checksum).not.toBe(source.checksum);

    await extractSourceContent(source.id);
    const after = await getSourcePages(source.id);
    expect(after).toHaveLength(1);
    expect(after[0].content).toContain("Nur noch ein kurzer Absatz.");
    expect((await readMarkdownSource(source.id)).content).toBe("# Neu\n\nNur noch ein kurzer Absatz.");
    expect((await getCertificationSource(source.id))?.status).toBe("parsed");
  });

  it("ändert nur den Titel, ohne den Status anzufassen", async () => {
    const { source } = await register("# Nur Titel\n\nText A", "Alt");
    await extractSourceContent(source.id);
    const result = await updateMarkdownSource({ sourceId: source.id, title: "  Neu  " });
    expect(result.contentChanged).toBe(false);
    expect(result.source.title).toBe("Neu");
    expect(result.source.status).toBe("parsed");
  });

  it("weist einen Text ab, den die Zertifizierung schon als andere Quelle hat", async () => {
    const other = await register("# Zwilling\n\nGleicher Text", "Original");
    const { source } = await register("# Anders\n\nAnderer Text", "Kopie");
    await expect(updateMarkdownSource({ sourceId: source.id, content: "# Zwilling\n\nGleicher Text" })).rejects.toMatchObject({ code: "duplicate" });
    // Unverändert geblieben.
    expect((await getCertificationSource(source.id))?.checksum).toBe(source.checksum);
    expect(other.source.id).not.toBe(source.id);
  });

  it("lehnt leeren Titel und leeren Text ab", async () => {
    const { source } = await register("# Pflicht\n\nText B", "Pflicht");
    await expect(updateMarkdownSource({ sourceId: source.id, title: "   " })).rejects.toMatchObject({ code: "invalid" });
    await expect(updateMarkdownSource({ sourceId: source.id, content: " \n " })).rejects.toMatchObject({ code: "invalid" });
  });

  it("sperrt geprüfte und freigegebene Quellen", async () => {
    const { source } = await register("# Gesperrt\n\nText C", "Gesperrt");
    for (const status of ["reviewed", "approved", "superseded"] as const) {
      await getDb().update(certificationSources).set({ status }).where(eq(certificationSources.id, source.id));
      await expect(updateMarkdownSource({ sourceId: source.id, content: "# Geändert\n\nText" })).rejects.toMatchObject({ code: "locked" });
      expect((await readMarkdownSource(source.id)).editable).toBe(false);
    }
  });

  it("lässt PDF-Quellen und unbekannte Kennungen nicht als Markdown bearbeiten", async () => {
    const [pdf] = await getDb()
      .insert(certificationSources)
      .values({ certificationId: certId, sourceType: "pdf", title: "PDF", provider: "T", storageKey: "00/" + "0".repeat(64) + ".pdf", mimeType: "application/pdf", fileSizeBytes: 1, checksum: randomUUID().replace(/-/g, "").padEnd(64, "0"), status: "uploaded" })
      .returning();
    await expect(updateMarkdownSource({ sourceId: pdf.id, title: "x" })).rejects.toMatchObject({ code: "not_markdown" });
    await expect(updateMarkdownSource({ sourceId: randomUUID(), title: "x" })).rejects.toBeInstanceOf(SourceEditError);
  });

  it("meldet, dass zu der Quelle schon ein Blueprint-Entwurf gehört", async () => {
    const { source } = await register("# Mit Entwurf\n\nText D", "Mit Entwurf");
    await extractSourceContent(source.id);
    await getDb().insert(blueprintDrafts).values({ sourceId: source.id, certificationId: certId, content: {}, suggestedSlug: `s-${randomUUID().slice(0, 6)}` });
    const result = await updateMarkdownSource({ sourceId: source.id, content: "# Mit Entwurf\n\nText D, überarbeitet" });
    expect(result.blueprintDraftExists).toBe(true);
  });
});
