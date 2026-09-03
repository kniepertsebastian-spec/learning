import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, sourceChunks } from "@/lib/server/db/schema";
import { sha256Hex, storageKeyForChecksum, writeSourceFile } from "@/lib/server/storage/local-disk";

export type CertificationSource = typeof certificationSources.$inferSelect;

export interface CertificationSourceWithChunkCount extends CertificationSource {
  chunkCount: number;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

export interface PdfValidationError {
  code: "too_large" | "wrong_mime_type" | "invalid_pdf_signature";
  message: string;
}

/**
 * R1.1 (roadmap.md): "Dateigröße, MIME-Type und PDF-Signatur validieren" -
 * alle drei geprüft, weil ein clientseitig gesetzter MIME-Type allein
 * fälschbar ist. Reine Funktion, damit sie ohne DB/Storage testbar ist.
 */
export function validatePdfUpload(input: {
  mimeType: string;
  fileSizeBytes: number;
  data: Buffer;
}): PdfValidationError | null {
  if (input.fileSizeBytes <= 0) {
    return { code: "too_large", message: "Datei ist leer." };
  }
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) {
    return {
      code: "too_large",
      message: `Datei ist größer als ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }
  if (input.mimeType !== "application/pdf") {
    return {
      code: "wrong_mime_type",
      message: `Unerwarteter MIME-Type "${input.mimeType}", erwartet application/pdf.`,
    };
  }
  if (!input.data.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return {
      code: "invalid_pdf_signature",
      message: "Datei beginnt nicht mit der PDF-Signatur (%PDF-).",
    };
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * Legt eine neue Quelle an oder gibt die vorhandene zurück, falls dieselbe
 * Zertifizierung dieselbe Datei (SHA-256) schon hat ("Wiederholter Upload
 * derselben Datei erzeugt keinen unbemerkten Doppelimport", R1.1-Test). Der
 * DB-Unique-Index (certification_id, checksum) ist die eigentliche Garantie,
 * der SELECT davor ist nur der schnelle, race-anfällige Vorab-Check - analog
 * zum Job-Schutz in R0.3.
 */
export async function registerCertificationSource(input: {
  certificationId: string;
  title: string;
  provider: string;
  publishedAt: Date | null;
  data: Buffer;
  mimeType: string;
}): Promise<{ source: CertificationSource; alreadyExisted: boolean }> {
  const db = getDb();
  const checksum = sha256Hex(input.data);

  const existing = await findByCertificationAndChecksum(input.certificationId, checksum);
  if (existing) return { source: existing, alreadyExisted: true };

  const storageKey = storageKeyForChecksum(checksum);
  await writeSourceFile(storageKey, input.data);

  try {
    const [source] = await db
      .insert(certificationSources)
      .values({
        certificationId: input.certificationId,
        sourceType: "pdf",
        title: input.title,
        provider: input.provider,
        storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: input.data.byteLength,
        checksum,
        publishedAt: input.publishedAt,
        status: "uploaded",
      })
      .returning();
    return { source, alreadyExisted: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const concurrent = await findByCertificationAndChecksum(input.certificationId, checksum);
      if (concurrent) return { source: concurrent, alreadyExisted: true };
    }
    throw error;
  }
}

async function findByCertificationAndChecksum(
  certificationId: string,
  checksum: string,
): Promise<CertificationSource | null> {
  const [existing] = await getDb()
    .select()
    .from(certificationSources)
    .where(
      and(
        eq(certificationSources.certificationId, certificationId),
        eq(certificationSources.checksum, checksum),
      ),
    )
    .limit(1);
  return existing ?? null;
}

/** Inklusive Anzahl bereits extrahierter Seiten (source_chunks) je Quelle,
 * damit die Admin-UI den Extraktionsfortschritt zeigen kann, ohne dafür pro
 * Quelle eine eigene Anfrage zu brauchen. */
export async function listCertificationSources(
  certificationId: string,
): Promise<CertificationSourceWithChunkCount[]> {
  const db = getDb();
  const sources = await db
    .select()
    .from(certificationSources)
    .where(eq(certificationSources.certificationId, certificationId))
    .orderBy(desc(certificationSources.createdAt));
  if (sources.length === 0) return [];

  const counts = await db
    .select({ sourceId: sourceChunks.sourceId, chunkCount: count() })
    .from(sourceChunks)
    .where(
      inArray(
        sourceChunks.sourceId,
        sources.map((source) => source.id),
      ),
    )
    .groupBy(sourceChunks.sourceId);
  const chunkCountBySource = new Map(counts.map((row) => [row.sourceId, row.chunkCount]));

  return sources.map((source) => ({
    ...source,
    chunkCount: chunkCountBySource.get(source.id) ?? 0,
  }));
}

export async function getCertificationSource(sourceId: string): Promise<CertificationSource | null> {
  const [source] = await getDb()
    .select()
    .from(certificationSources)
    .where(eq(certificationSources.id, sourceId))
    .limit(1);
  return source ?? null;
}

export interface SourcePage {
  pageNumber: number;
  content: string;
}

/** R1.3: geordneter Seitentext für die Original-vs-Extraktion-Ansicht
 * ("Originalquelle und extrahierte Struktur nebeneinander anzeigen"). */
export async function getSourcePages(sourceId: string): Promise<SourcePage[]> {
  const rows = await getDb()
    .select({ pageNumber: sourceChunks.pageNumber, content: sourceChunks.content })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId))
    .orderBy(sourceChunks.pageNumber);
  return rows;
}
