import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationUploads } from "@/lib/server/db/schema";
import { splitIntoSections, type SourceExcerpt } from "@/lib/server/documents/sections";
import { cleanFilename, inspectUpload, type UploadRejection } from "@/lib/server/documents/upload";
import type { SecretKind } from "@/lib/server/documents/secret-scanner";
import { isUploadRef, UPLOAD_REF_PREFIX, uploadRef } from "@/lib/course-generation/source-refs";

export { isUploadRef, UPLOAD_REF_PREFIX, uploadRef };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SavedUpload {
  ref: string;
  filename: string;
  pageCount: number;
}

/**
 * Höchstgröße einer hochgeladenen Kursquelle: wie beim Abruf per Adresse (MAX_SOURCE_BYTES in sources.ts), nicht die 10 MB
 * der Firmendokumente. Gespeichert wird nur der gelesene Text, nicht die Datei (Quellen-Roadmap AP-1.3).
 */
export const MAX_COURSE_SOURCE_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Prüft eine hochgeladene Quelldatei (Typ, lesbarer Text, Zugangsdaten wie bei Firmendokumenten) und speichert ihren Text.
 * Die Datei selbst wird nicht aufbewahrt, nur der gelesene Text je Seite. `suppressKinds`: Fund-Arten, die der Betreiber als
 * Fehlalarm bestätigt hat (z. B. Beispiel-Zugangsdaten in einer öffentlichen IT-Dokumentation); nur bestätigbare Arten wirken.
 */
export async function saveCourseGenerationUpload(input: { userId: string; filename: string; mimeType: string; data: Buffer; suppressKinds?: readonly SecretKind[] }): Promise<{ ok: true; upload: SavedUpload } | UploadRejection> {
  const filename = cleanFilename(input.filename);
  const inspection = await inspectUpload({ filename, mimeType: input.mimeType, data: input.data }, { maxBytes: MAX_COURSE_SOURCE_UPLOAD_BYTES, suppressKinds: input.suppressKinds });
  if (!inspection.ok) return inspection;
  const [row] = await getDb()
    .insert(courseGenerationUploads)
    .values({
      uploadedByUserId: input.userId,
      filename,
      mimeType: inspection.mimeType,
      sizeBytes: input.data.byteLength,
      kind: inspection.kind,
      pages: inspection.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
    })
    .returning({ id: courseGenerationUploads.id });
  return { ok: true, upload: { ref: uploadRef(row.id), filename, pageCount: inspection.pageCount } };
}

export interface LoadedUpload {
  filename: string;
  excerpts: SourceExcerpt[];
}

/** Text einer hochgeladenen Quelle als Ausschnitte (PDF: „S. n“, sonst Abschnitte); null, wenn es sie nicht (mehr) gibt. */
export async function loadCourseGenerationUpload(ref: string): Promise<LoadedUpload | null> {
  const id = ref.slice(UPLOAD_REF_PREFIX.length);
  if (!UUID.test(id)) return null;
  const [row] = await getDb().select().from(courseGenerationUploads).where(eq(courseGenerationUploads.id, id)).limit(1);
  if (!row) return null;
  return { filename: row.filename, excerpts: uploadExcerpts(row.kind, row.pages) };
}

export function uploadExcerpts(kind: string, pages: { pageNumber: number; text: string }[]): SourceExcerpt[] {
  if (kind === "pdf") return pages.map((p) => ({ locator: `S. ${p.pageNumber}`, text: p.text }));
  return splitIntoSections(pages.map((p) => p.text).join("\n\n"));
}
