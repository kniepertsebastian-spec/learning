import { eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { readSourceFile, sha256Hex } from "@/lib/server/storage/local-disk";
import { getCertificationSource } from "./sources";

export class SourceNotFoundError extends Error {}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

/**
 * R1.1 (roadmap.md): "Text seitenweise extrahieren und Seitenbezug erhalten" -
 * reine Funktion (PDF-Bytes -> Seiten mit Text), damit sie ohne DB/Storage
 * testbar ist. `pdf-parse`s `getText()` liefert bereits pro Seite
 * `{ num, text }` (siehe TextResult.d.ts), kein eigenes Chunking nötig.
 */
export async function extractPdfPages(data: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNumber: page.num, text: page.text }));
  } finally {
    await parser.destroy();
  }
}

/**
 * Extrahiert Text aus einer bereits hochgeladenen Quelle und speichert ihn
 * mit Seitenbezug in source_chunks. Idempotent: ein erneuter Aufruf
 * überschreibt die Chunks derselben Seite statt sie zu duplizieren (Unique
 * Index auf sourceId+pageNumber). Setzt status auf "parsed" bzw. "failed"
 * mit parseError statt die Quelle bei einem Fehler unverändert zu lassen.
 */
export async function extractSourceContent(sourceId: string): Promise<void> {
  const db = getDb();
  const source = await getCertificationSource(sourceId);
  if (!source) throw new SourceNotFoundError(`Quelle ${sourceId} nicht gefunden.`);

  try {
    const data = await readSourceFile(source.storageKey);
    const pages = await extractPdfPages(data);

    if (pages.length === 0 || pages.every((page) => !page.text.trim())) {
      throw new Error(
        "Aus der PDF-Datei konnte kein Text extrahiert werden (evtl. eingescannt/nur Bilder ohne OCR).",
      );
    }

    await db.transaction(async (tx) => {
      for (const page of pages) {
        const contentHash = sha256Hex(Buffer.from(page.text, "utf-8"));
        await tx
          .insert(sourceChunks)
          .values({
            sourceId,
            pageNumber: page.pageNumber,
            content: page.text,
            contentHash,
          })
          .onConflictDoUpdate({
            target: [sourceChunks.sourceId, sourceChunks.pageNumber],
            set: { content: page.text, contentHash },
          });
      }
      await tx
        .update(certificationSources)
        .set({ status: "parsed", parseError: null })
        .where(eq(certificationSources.id, sourceId));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(certificationSources)
      .set({ status: "failed", parseError: message.slice(0, 4_000) })
      .where(eq(certificationSources.id, sourceId));
    throw error;
  }
}
