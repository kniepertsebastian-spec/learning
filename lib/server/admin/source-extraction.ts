import { and, eq, gt } from "drizzle-orm";
import { extractPdfPages } from "@/lib/server/documents/pdf-text";
import { splitIntoSections } from "@/lib/server/documents/sections";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { readSourceFile, sha256Hex } from "@/lib/server/storage/local-disk";
import { decodeMarkdown, getCertificationSource } from "./sources";

// Die PDF-Textextraktion liegt in lib/server/documents/pdf-text.ts (auch vom Firmenbereich genutzt, der keine
// Lernquellen-Module importieren darf); hier bleibt sie unter dem bisherigen Namen erreichbar.
export { extractPdfPages, type ExtractedPage } from "@/lib/server/documents/pdf-text";

/**
 * Grobe HTML-Text-Extraktion für URL-Quellen ohne PDF-Inhalt - dieselbe
 * Regex-Logik wie stripHtml() in lib/server/course-generation/sources.ts,
 * hier lokal dupliziert statt importiert: course-generation/sources.ts
 * importiert bereits extractPdfPages() AUS diesem Modul, ein Import in die
 * Gegenrichtung wäre ein zyklischer Import zwischen den beiden Dateien.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class SourceNotFoundError extends Error {}

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
    const isMarkdown = source.sourceType === "markdown";
    const isPdf = !isMarkdown && source.mimeType === "application/pdf";
    let pages: Array<{ pageNumber: number; text: string }>;
    if (isMarkdown) {
      // Markdown hat keine Seiten: Abschnitte (an Überschriften) übernehmen die Rolle der Seiten, damit Blueprint und Prüfansicht
      // wie bei PDFs auf Teile der Quelle verweisen können.
      pages = splitIntoSections(decodeMarkdown(data)).map((section, index) => ({ pageNumber: index + 1, text: section.text }));
    } else if (isPdf) {
      pages = await extractPdfPages(data);
    } else {
      pages = [{ pageNumber: 1, text: stripHtml(data.toString("utf-8")) }];
    }

    if (pages.length === 0 || pages.every((page) => !page.text.trim())) {
      throw new Error(
        isPdf
          ? "Aus der PDF-Datei konnte kein Text extrahiert werden (evtl. eingescannt/nur Bilder ohne OCR)."
          : isMarkdown
            ? "Die Markdown-Datei enthält keinen Text."
            : "Aus der URL-Quelle konnte kein verwertbarer Text extrahiert werden.",
      );
    }

    await db.transaction(async (tx) => {
      // Ein geänderter Markdown-Text kann weniger Abschnitte haben als vorher: übrig gebliebene Abschnitte weg, sonst zeigen
      // Prüfansicht und Blueprint Text, der gar nicht mehr in der Quelle steht.
      await tx
        .delete(sourceChunks)
        .where(and(eq(sourceChunks.sourceId, sourceId), gt(sourceChunks.pageNumber, Math.max(...pages.map((page) => page.pageNumber)))));
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
