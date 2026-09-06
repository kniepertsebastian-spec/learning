import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { readSourceFile, sha256Hex } from "@/lib/server/storage/local-disk";
import { getCertificationSource } from "./sources";

export class SourceNotFoundError extends Error {}

const execFileAsync = promisify(execFile);
const PDFTOTEXT_COMMAND = process.env.PDFTOTEXT_PATH?.trim() || "pdftotext";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

/**
 * R1.1 (roadmap.md): "Text seitenweise extrahieren und Seitenbezug erhalten" -
 * reine Funktion (PDF-Bytes -> Seiten mit Text), damit sie ohne DB/Storage
 * testbar ist. Popplers `pdftotext` trennt Seiten durch Form-Feed-Zeichen.
 *
 * `pdf-parse` 2.x wurde hier bewusst entfernt: Es lädt über pdfjs-dist das
 * native `@napi-rs/canvas`/Skia-Binary bereits beim Modulimport. Auf älteren
 * x86-CPUs kann dieses Binary mit SIGILL abbrechen - bei Next.js geschah das
 * schon während "Collecting page data" und verhinderte das Docker-Image.
 * `pdftotext` wird ohne Shell mit festen Argumenten aufgerufen; PDF-Inhalte
 * können daher keine zusätzlichen Befehlsargumente einschleusen.
 */
export async function extractPdfPages(data: Buffer): Promise<ExtractedPage[]> {
  const workDir = await mkdtemp(join(tmpdir(), "certstudy-pdf-"));
  const inputPath = join(workDir, "source.pdf");
  const outputPath = join(workDir, "source.txt");

  try {
    await writeFile(inputPath, data, { flag: "wx", mode: 0o600 });

    try {
      await execFileAsync(
        PDFTOTEXT_COMMAND,
        ["-enc", "UTF-8", "-layout", inputPath, outputPath],
        { timeout: 60_000, maxBuffer: 1024 * 1024 },
      );
    } catch (error) {
      const cause = error as NodeJS.ErrnoException & { stderr?: string };
      if (cause.code === "ENOENT") {
        throw new Error(
          `PDF-Textextraktion ist nicht installiert (${PDFTOTEXT_COMMAND} fehlt).`,
          { cause: error },
        );
      }
      const detail = cause.stderr?.trim();
      throw new Error(
        detail ? `PDF-Textextraktion fehlgeschlagen: ${detail}` : "PDF-Textextraktion fehlgeschlagen.",
        { cause: error },
      );
    }

    const extracted = (await readFile(outputPath, "utf8")).replaceAll("\r\n", "\n");
    const pageTexts = extracted.split("\f");

    // pdftotext beendet reguläre Dokumente mit einem letzten Seitenumbruch.
    // Nur dieses technische Schlusssegment entfernen; leere Seiten innerhalb
    // des Dokuments bleiben erhalten und behalten so ihre echte Seitennummer.
    if (pageTexts.at(-1) === "") pageTexts.pop();

    return pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      text: text.trim(),
    }));
  } finally {
    await rm(workDir, { recursive: true, force: true });
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
