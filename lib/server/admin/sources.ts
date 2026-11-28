import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  blueprintDrafts,
  certificationSources,
  sourceChunks,
  type CertificationSourceStatus,
  type CertificationSourceType,
} from "@/lib/server/db/schema";
import { readSourceFile, sha256Hex, storageKeyForChecksum, writeSourceFile } from "@/lib/server/storage/local-disk";
import { fetchUrlSafely, looksLikePdf, UrlFetchError } from "@/lib/server/network/fetch-url";
import { UnsafeUrlError } from "@/lib/server/network/ssrf-guard";

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

interface RegisterSourceInput {
  certificationId: string;
  sourceType: CertificationSourceType;
  title: string;
  provider: string;
  publishedAt: Date | null;
  data: Buffer;
  mimeType: string;
  sourceUrl?: string | null;
  /** R1.5: markiert diesen Upload als neue Ausgabe einer bereits
   * freigegebenen Quelle - approveBlueprintDraft() nutzt das für den Diff
   * und die stale-Markierung betroffener Lessons/Fragen. */
  supersedesSourceId?: string | null;
}

/**
 * Legt eine neue Quelle an oder gibt die vorhandene zurück, falls dieselbe
 * Zertifizierung dieselben Bytes (SHA-256) schon hat ("Wiederholter Upload
 * derselben Datei erzeugt keinen unbemerkten Doppelimport", R1.1-Test) -
 * gilt unabhängig davon, ob die Bytes per Datei-Upload oder URL-Abruf
 * hereinkamen. Der DB-Unique-Index (certification_id, checksum) ist die
 * eigentliche Garantie, der SELECT davor ist nur der schnelle,
 * race-anfällige Vorab-Check - analog zum Job-Schutz in R0.3.
 */
async function insertSourceRecord(
  input: RegisterSourceInput,
): Promise<{ source: CertificationSource; alreadyExisted: boolean }> {
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
        sourceType: input.sourceType,
        title: input.title,
        provider: input.provider,
        storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: input.data.byteLength,
        checksum,
        sourceUrl: input.sourceUrl ?? null,
        publishedAt: input.publishedAt,
        status: "uploaded",
        supersedesSourceId: input.supersedesSourceId ?? null,
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

export async function registerCertificationSource(input: {
  certificationId: string;
  title: string;
  provider: string;
  publishedAt: Date | null;
  data: Buffer;
  mimeType: string;
  supersedesSourceId?: string | null;
}): Promise<{ source: CertificationSource; alreadyExisted: boolean }> {
  return insertSourceRecord({ ...input, sourceType: "pdf" });
}

/** Markdown ist reiner Text: 5 MB sind weit mehr, als ein Prüfungsleitfaden je hat, und halten die Seitenzerlegung schnell. */
export const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const MARKDOWN_MIME_TYPES = new Set(["", "text/markdown", "text/x-markdown", "text/plain", "application/octet-stream"]);
const MARKDOWN_MIME = "text/markdown";
/** Sehr viel länger als jede sinnvolle Quellenbezeichnung; verhindert nur Fehleingaben. */
const MAX_SOURCE_TITLE_CHARS = 300;

export interface MarkdownValidationError {
  code: "empty" | "too_large" | "wrong_mime_type" | "not_text";
  message: string;
}

/**
 * Ob eine hochgeladene Datei als Markdown behandelt werden soll: nach Endung (.md, .markdown) oder, falls der Browser sie
 * kennt, nach dem MIME-Type. Browser melden für .md je nach System text/markdown, text/plain oder gar nichts, deshalb entscheidet
 * hier vor allem die Endung.
 */
export function isMarkdownUpload(file: { name: string; type: string }): boolean {
  return /\.(md|markdown)$/i.test(file.name) || file.type === "text/markdown" || file.type === "text/x-markdown";
}

/** Dekodiert Markdown-Bytes als UTF-8 (ohne Byte-Order-Mark, Zeilenenden als \n) und wirft, wenn es kein gültiger UTF-8-Text ist. */
export function decodeMarkdown(data: Buffer): string {
  // fatal: ungültige Byte-Folgen (z. B. Latin-1-Umlaute, eine umbenannte Binärdatei) ergeben einen Fehler statt „�“ im Kurs.
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Prüft einen Markdown-Upload wie validatePdfUpload() die PDF: Größe, MIME-Type und - weil es keine Signatur gibt - dass es
 * lesbarer UTF-8-Text ist (kein NUL-Byte, gültig kodiert, nicht leer). Reine Funktion, damit sie ohne DB testbar ist.
 */
export function validateMarkdownUpload(input: { mimeType: string; fileSizeBytes: number; data: Buffer }): MarkdownValidationError | null {
  if (input.fileSizeBytes <= 0) return { code: "empty", message: "Datei ist leer." };
  if (input.fileSizeBytes > MAX_MARKDOWN_BYTES) {
    return { code: "too_large", message: `Markdown-Datei ist größer als ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB.` };
  }
  if (!MARKDOWN_MIME_TYPES.has(input.mimeType)) {
    return { code: "wrong_mime_type", message: `Unerwarteter MIME-Type "${input.mimeType}", erwartet Markdown oder Text.` };
  }
  if (input.data.includes(0)) {
    return { code: "not_text", message: "Die Datei enthält Binärdaten und ist keine Markdown-Datei." };
  }
  let text: string;
  try {
    text = decodeMarkdown(input.data);
  } catch {
    return { code: "not_text", message: "Die Datei ist kein gültiger UTF-8-Text. Bitte als UTF-8 speichern." };
  }
  if (!text.trim()) return { code: "empty", message: "Die Datei enthält keinen Text." };
  return null;
}

/** Markdown-Datei als Quelle anlegen (Dedup über die Checksumme wie bei PDF und URL). */
export async function registerCertificationSourceMarkdown(input: {
  certificationId: string;
  title: string;
  provider: string;
  publishedAt: Date | null;
  data: Buffer;
  supersedesSourceId?: string | null;
}): Promise<{ source: CertificationSource; alreadyExisted: boolean }> {
  return insertSourceRecord({ ...input, sourceType: "markdown", mimeType: MARKDOWN_MIME });
}

/** Solange der Text nur hochgeladen, ausgelesen oder fehlgeschlagen ist, darf er noch geändert werden; danach hängen Prüfung und Freigabe daran. */
const EDITABLE_STATUSES: CertificationSourceStatus[] = ["uploaded", "parsed", "failed"];

/** Ob die Quelle eine Markdown-Quelle ist, die sich im Nachhinein noch bearbeiten lässt. */
export function isEditableMarkdownSource(source: Pick<CertificationSource, "sourceType" | "status">): boolean {
  return source.sourceType === "markdown" && EDITABLE_STATUSES.includes(source.status);
}

export class SourceEditError extends Error {
  constructor(
    readonly code: "not_found" | "not_markdown" | "locked" | "invalid" | "duplicate",
    message: string,
  ) {
    super(message);
  }
}

export interface MarkdownSourceUpdateResult {
  source: CertificationSource;
  /** Der Text hat sich geändert: die Quelle steht wieder auf „uploaded“ und muss neu ausgelesen werden. */
  contentChanged: boolean;
  /** Zu dieser Quelle gibt es schon einen Blueprint-Entwurf, der noch den alten Text kennt. */
  blueprintDraftExists: boolean;
}

/** Der Markdown-Text einer Quelle, wie er gespeichert ist (für den Editor). */
export async function readMarkdownSource(sourceId: string): Promise<{ source: CertificationSource; content: string; editable: boolean }> {
  const source = await getCertificationSource(sourceId);
  if (!source) throw new SourceEditError("not_found", "Quelle nicht gefunden.");
  if (source.sourceType !== "markdown") throw new SourceEditError("not_markdown", "Nur Markdown-Quellen lassen sich als Text bearbeiten.");
  const content = decodeMarkdown(await readSourceFile(source.storageKey));
  return { source, content, editable: isEditableMarkdownSource(source) };
}

/**
 * Ändert Titel und/oder Text einer Markdown-Quelle. Der neue Text wird wie ein Upload inhaltsadressiert abgelegt (neue
 * Checksumme, neue Datei); die alte Datei bleibt liegen, weil sie von einer anderen Quelle derselben Bytes mitgenutzt werden
 * kann. Ändert sich der Text, geht die Quelle zurück auf „uploaded“: der Aufrufer liest sie danach neu aus
 * (extractSourceContent). Freigegebene oder geprüfte Quellen bleiben unverändert - dafür gibt es die neue Ausgabe
 * (supersedesSourceId).
 */
export async function updateMarkdownSource(input: {
  sourceId: string;
  title?: string;
  content?: string;
}): Promise<MarkdownSourceUpdateResult> {
  const db = getDb();
  const source = await getCertificationSource(input.sourceId);
  if (!source) throw new SourceEditError("not_found", "Quelle nicht gefunden.");
  if (source.sourceType !== "markdown") throw new SourceEditError("not_markdown", "Nur Markdown-Quellen lassen sich bearbeiten.");
  if (!isEditableMarkdownSource(source)) {
    throw new SourceEditError(
      "locked",
      "Diese Quelle ist bereits geprüft oder freigegeben und lässt sich nicht mehr ändern. Lade stattdessen eine neue Ausgabe hoch.",
    );
  }

  const title = input.title === undefined ? source.title : input.title.trim();
  if (!title || title.length > MAX_SOURCE_TITLE_CHARS) {
    throw new SourceEditError("invalid", `Der Titel darf nicht leer sein und höchstens ${MAX_SOURCE_TITLE_CHARS} Zeichen haben.`);
  }

  let data: Buffer | null = null;
  if (input.content !== undefined) {
    const text = input.content.replace(/\r\n?/g, "\n");
    if (!text.trim()) throw new SourceEditError("invalid", "Der Text darf nicht leer sein.");
    data = Buffer.from(text, "utf-8");
    if (data.byteLength > MAX_MARKDOWN_BYTES) {
      throw new SourceEditError("invalid", `Der Text ist größer als ${MAX_MARKDOWN_BYTES / (1024 * 1024)} MB.`);
    }
  }

  const checksum = data ? sha256Hex(data) : source.checksum;
  const contentChanged = checksum !== source.checksum;
  if (!contentChanged && title === source.title) {
    return { source, contentChanged: false, blueprintDraftExists: false };
  }

  if (contentChanged && data) {
    // Dieselbe Zertifizierung darf denselben Text nur einmal haben (Unique-Index auf certification_id + checksum).
    const twin = await findByCertificationAndChecksum(source.certificationId, checksum);
    if (twin && twin.id !== source.id) {
      throw new SourceEditError("duplicate", `Genau diesen Text gibt es in dieser Zertifizierung schon als Quelle „${twin.title}“.`);
    }
  }

  const storageKey = contentChanged ? storageKeyForChecksum(checksum) : source.storageKey;
  if (contentChanged && data) await writeSourceFile(storageKey, data);

  let updated: CertificationSource | undefined;
  try {
    [updated] = await db
      .update(certificationSources)
      .set(
        contentChanged && data
          ? { title, checksum, storageKey, fileSizeBytes: data.byteLength, status: "uploaded", parseError: null }
          : { title },
      )
      // Der Status steht in der Bedingung: wurde die Quelle inzwischen geprüft, ändert dieses UPDATE nichts.
      .where(and(eq(certificationSources.id, source.id), inArray(certificationSources.status, EDITABLE_STATUSES)))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SourceEditError("duplicate", "Genau diesen Text gibt es in dieser Zertifizierung schon als Quelle.");
    }
    throw error;
  }
  if (!updated) {
    throw new SourceEditError("locked", "Die Quelle wurde inzwischen geprüft oder freigegeben und lässt sich nicht mehr ändern.");
  }

  let blueprintDraftExists = false;
  if (contentChanged) {
    const [draft] = await db.select({ id: blueprintDrafts.id }).from(blueprintDrafts).where(eq(blueprintDrafts.sourceId, source.id)).limit(1);
    blueprintDraftExists = Boolean(draft);
  }
  return { source: updated, contentChanged, blueprintDraftExists };
}

const MAX_URL_SOURCE_BYTES = MAX_UPLOAD_BYTES;
const URL_FETCH_TIMEOUT_MS = 30_000;
const PDF_CONTENT_TYPE = "application/pdf";

export interface UrlSourceValidationError {
  code: "invalid_url";
  message: string;
}

/**
 * Formsynchrone Vorprüfung ohne Netzwerkzugriff (schnelles Feedback vor dem
 * eigentlichen, DNS-abhängigen SSRF-Check in fetchUrlSafely()) - analog zu
 * validatePdfUpload() oben.
 */
export function validateSourceUrlShape(url: string): UrlSourceValidationError | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "invalid_url", message: `"${url}" ist keine gültige URL.` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { code: "invalid_url", message: "Nur http(s)-URLs sind erlaubt." };
  }
  return null;
}

/**
 * R1.1 (roadmap.md): "offizielle PDF- oder URL-Quelle importieren" -
 * URL-Variante. Ruft die URL serverseitig ab (SSRF-abgesichert über
 * fetchUrlSafely()/assertPublicHttpUrl()) und speichert die abgerufenen
 * Bytes GENAUSO wie einen Datei-Upload (Checksum-Dedup, lokale
 * Storage-Ablage) - die Quelle bleibt dadurch reproduzierbar, auch wenn die
 * URL später offline geht, und die restliche Pipeline (Textextraktion,
 * Blueprint, Review) kann PDF- und URL-Quellen identisch behandeln.
 */
export async function registerCertificationSourceFromUrl(input: {
  certificationId: string;
  title: string;
  provider: string;
  publishedAt: Date | null;
  url: string;
  supersedesSourceId?: string | null;
}): Promise<{ source: CertificationSource; alreadyExisted: boolean }> {
  const shapeError = validateSourceUrlShape(input.url);
  if (shapeError) throw new UnsafeUrlError(shapeError.message);

  const fetched = await fetchUrlSafely(input.url, {
    timeoutMs: URL_FETCH_TIMEOUT_MS,
    maxBytes: MAX_URL_SOURCE_BYTES,
  });
  const { buffer } = fetched;

  // Auch nach einer Weiterleitung (z. B. /download.php?id=… -> /files/plan.pdf) oder als application/octet-stream.
  const isPdf = looksLikePdf(fetched, input.url);
  const mimeType = isPdf ? PDF_CONTENT_TYPE : "text/html";
  if (isPdf && !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new UrlFetchError(
      `Quelle "${input.url}" gibt sich als PDF aus, beginnt aber nicht mit der PDF-Signatur (%PDF-).`,
    );
  }

  return insertSourceRecord({
    certificationId: input.certificationId,
    sourceType: "url",
    title: input.title,
    provider: input.provider,
    publishedAt: input.publishedAt,
    data: buffer,
    mimeType,
    sourceUrl: input.url,
    supersedesSourceId: input.supersedesSourceId,
  });
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
