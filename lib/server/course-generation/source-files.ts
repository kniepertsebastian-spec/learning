import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationSourceFiles } from "@/lib/server/db/schema";
import { cleanFilename, inspectUpload, type UploadInspection } from "@/lib/server/documents/upload";
import { splitIntoSections, type FetchedSource, type SkippedSource, type SourceExcerpt } from "./sources";

/** Eine hochgeladene Datei als Quelle eines Betreiber-Auftrags (Kurs generieren). */
export interface SourceFileInput {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export type SourceFileProblem = { filename: string; message: string };

/** Mindestmenge Text je Datei, wie bei einer Adresse (fetchSource): darunter taugt sie nicht als Quelle. */
const MIN_FILE_CHARS = 200;

/**
 * Prüft die Dateien vor dem Anlegen des Auftrags (Typ, Inhalt, lesbarer Text, Secret-Scanner; dieselben Regeln wie bei
 * Firmendokumenten). Liefert die Probleme je Datei; leer heißt: alle Dateien sind brauchbar.
 */
export async function checkSourceFiles(files: SourceFileInput[]): Promise<SourceFileProblem[]> {
  const problems: SourceFileProblem[] = [];
  for (const file of files) {
    const filename = cleanFilename(file.filename);
    const inspection = await inspectUpload({ filename, mimeType: file.mimeType, data: file.data });
    if (!inspection.ok) {
      problems.push({ filename, message: inspection.message });
      continue;
    }
    const chars = inspection.pages.reduce((n, p) => n + p.text.trim().length, 0);
    if (chars < MIN_FILE_CHARS) problems.push({ filename, message: `Die Datei enthält zu wenig Text (${chars} Zeichen).` });
  }
  return problems;
}

/** Legt die (geprüften) Dateien am Auftrag ab, in der Reihenfolge der Eingabe. */
export async function saveSourceFiles(jobId: string, files: SourceFileInput[]): Promise<void> {
  if (files.length === 0) return;
  await getDb()
    .insert(courseGenerationSourceFiles)
    .values(
      files.map((file, orderNum) => ({
        jobId,
        orderNum,
        filename: cleanFilename(file.filename),
        mimeType: file.mimeType,
        sizeBytes: file.data.byteLength,
        data: file.data,
      })),
    );
}

/** Namen der Dateien eines Auftrags (für Anzeige und Prüfungen), ohne Inhalt. */
export async function listSourceFileNames(jobId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ filename: courseGenerationSourceFiles.filename })
    .from(courseGenerationSourceFiles)
    .where(eq(courseGenerationSourceFiles.jobId, jobId))
    .orderBy(asc(courseGenerationSourceFiles.orderNum));
  return rows.map((r) => r.filename);
}

/**
 * Die Dateien eines Auftrags als Quellen. Teile eines aufgeteilten Kurses haben keine eigenen Dateien und lesen die des
 * ersten Teils (`fallbackJobId`). Eine Datei, die sich nicht (mehr) lesen lässt, wird übersprungen und gemeldet, wie eine
 * nicht erreichbare Adresse. Die Kennungen („file-2“) folgen der Stelle in der Eingabe.
 */
export async function loadSourceFiles(jobId: string, fallbackJobId?: string | null): Promise<{ sources: FetchedSource[]; skipped: SkippedSource[] }> {
  let rows = await selectFiles(jobId);
  if (rows.length === 0 && fallbackJobId) rows = await selectFiles(fallbackJobId);
  const sources: FetchedSource[] = [];
  const skipped: SkippedSource[] = [];
  for (const [index, row] of rows.entries()) {
    const label = `Datei: ${row.filename}`;
    let inspection: UploadInspection;
    try {
      inspection = await inspectUpload({ filename: row.filename, mimeType: row.mimeType, data: Buffer.from(row.data) });
    } catch {
      skipped.push({ url: label, error: "Die Datei konnte nicht gelesen werden." });
      continue;
    }
    if (!inspection.ok) {
      skipped.push({ url: label, error: inspection.message });
      continue;
    }
    sources.push(toFetchedSource(`file-${index + 1}`, row.filename, inspection));
  }
  return { sources, skipped };
}

async function selectFiles(jobId: string) {
  return getDb()
    .select({ filename: courseGenerationSourceFiles.filename, mimeType: courseGenerationSourceFiles.mimeType, data: courseGenerationSourceFiles.data })
    .from(courseGenerationSourceFiles)
    .where(eq(courseGenerationSourceFiles.jobId, jobId))
    .orderBy(asc(courseGenerationSourceFiles.orderNum));
}

/** Seiten einer geprüften Datei als Quelle: PDFs seitenweise („S. 3“), Fließtext in Abschnitten, Exporte je Seite. Ungekappt (das übernimmt der Aufrufer). */
export function toFetchedSource(id: string, filename: string, inspection: Extract<UploadInspection, { ok: true }>): FetchedSource {
  let excerpts: SourceExcerpt[];
  if (inspection.kind === "pdf") {
    excerpts = inspection.pages.map((p) => ({ locator: `${filename} · S. ${p.pageNumber}`, text: p.text }));
  } else if (inspection.kind === "text") {
    excerpts = splitIntoSections(inspection.pages[0]?.text ?? "").map((s) => ({ locator: `${filename} · ${s.locator}`, text: s.text }));
  } else {
    excerpts = inspection.pages.map((p) => ({ locator: `${filename} · Seite ${p.pageNumber}`, text: p.text }));
  }
  return {
    id,
    title: filename,
    url: `datei:${filename}`,
    retrievedAt: new Date().toISOString(),
    excerpts,
    truncated: false,
  };
}
