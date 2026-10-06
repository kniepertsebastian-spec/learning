import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
