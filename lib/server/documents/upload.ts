import { extractPdfPages, type ExtractedPage } from "./pdf-text";
import { StructuredExportError, structuredKindOf, structuredPages, type StructuredKind } from "./structured";
import { isSuppressible, scanForSecrets, type SecretFinding, type SecretKind } from "./secret-scanner";

/** Höchstgröße eines Firmendokuments. Die Datei liegt in der Datenbank, deshalb bewusst kleiner als bei Lernquellen. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Weniger Text als das gilt bei PDFs als „kein durchsuchbarer Text“ (z. B. eingescannte Seiten). */
export const MIN_PDF_TEXT_CHARS = 20;

export type DocumentKind = "pdf" | "text" | "export";

export type UploadRejection =
  | { ok: false; code: "empty" | "too_large" | "unsupported_type" | "invalid_content" | "unreadable" | "no_text"; message: string }
  | { ok: false; code: "secrets_found"; message: string; findings: SecretFinding[] };

export type UploadInspection =
  | { ok: true; kind: DocumentKind; mimeType: string; pages: ExtractedPage[]; pageCount: number; suppressed: SecretFinding[] }
  | UploadRejection;

const STRUCTURED_MIME: Record<StructuredKind, { stored: string; accepted: string[] }> = {
  json: { stored: "application/json", accepted: ["application/json", "text/json"] },
  xml: { stored: "application/xml", accepted: ["application/xml", "text/xml"] },
  html: { stored: "text/html", accepted: ["text/html"] },
};

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Dateiname ohne Pfad (Browser und Angreifer können alles schicken). */
export function cleanFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "dokument").slice(0, 200);
}

/**
 * Prüft ein hochgeladenes Dokument, ohne es zu speichern: Größe, Typ (Endung, MIME-Typ UND Inhalt),
 * lesbarer Text und der Secret-Scanner. Nur wenn alles besteht, darf es abgelegt werden.
 */
export async function inspectUpload(
  input: { filename: string; mimeType: string; data: Buffer },
  /** Fund-Arten, die der Aufrufer als Fehlalarm bestätigt hat (nur Arten aus SUPPRESSIBLE_KINDS wirken). */
  options: { suppressKinds?: readonly SecretKind[] } = {},
): Promise<UploadInspection> {
  const { data } = input;
  if (data.byteLength === 0) return { ok: false, code: "empty", message: "Die Datei ist leer." };
  if (data.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, code: "too_large", message: `Die Datei ist größer als ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.` };
  }

  const ext = extensionOf(input.filename);
  const mime = input.mimeType.trim().toLowerCase();
  let kind: DocumentKind;
  let structuredKind: StructuredKind | null = null;
  let mimeType: string;
  if (ext === "pdf") {
    if (mime !== "application/pdf") return unsupported();
    kind = "pdf";
    mimeType = "application/pdf";
  } else if (ext === "txt" || ext === "md") {
    // Browser schicken für Textdateien teils gar keinen oder einen allgemeinen Typ.
    if (!["text/plain", "text/markdown", "text/x-markdown", "application/octet-stream", ""].includes(mime)) return unsupported();
    kind = "text";
    mimeType = ext === "md" ? "text/markdown" : "text/plain";
  } else if (structuredKindOf(ext)) {
    structuredKind = structuredKindOf(ext);
    const expected = STRUCTURED_MIME[structuredKind!];
    if (![...expected.accepted, "application/octet-stream", ""].includes(mime)) return unsupported();
    kind = "export";
    mimeType = expected.stored;
  } else {
    return unsupported();
  }

  let pages: ExtractedPage[];
  if (kind === "pdf") {
    if (!data.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      return { ok: false, code: "invalid_content", message: "Die Datei beginnt nicht mit der PDF-Signatur (%PDF-)." };
    }
    try {
      pages = await extractPdfPages(data);
    } catch {
      return { ok: false, code: "unreadable", message: "Das PDF konnte nicht gelesen werden (beschädigt oder verschlüsselt?)." };
    }
    const chars = pages.reduce((n, p) => n + p.text.replace(/\s+/g, "").length, 0);
    if (chars < MIN_PDF_TEXT_CHARS) {
      return {
        ok: false,
        code: "no_text",
        message: "Das PDF enthält keinen auswählbaren Text (z. B. eingescannte Seiten). Es kann nicht auf Zugangsdaten geprüft werden und wird deshalb nicht angenommen.",
      };
    }
  } else if (kind === "export") {
    if (data.includes(0)) return { ok: false, code: "invalid_content", message: "Die Datei enthält Binärdaten." };
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return { ok: false, code: "invalid_content", message: "Die Datei ist nicht UTF-8-kodiert." };
    }
    try {
      pages = structuredPages(structuredKind!, raw).map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    } catch (err) {
      if (err instanceof StructuredExportError) return { ok: false, code: "unreadable", message: err.message };
      throw err;
    }
  } else {
    if (data.includes(0)) {
      return { ok: false, code: "invalid_content", message: "Die Textdatei enthält Binärdaten." };
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return { ok: false, code: "invalid_content", message: "Die Textdatei ist nicht UTF-8-kodiert." };
    }
    pages = [{ pageNumber: 1, text }];
  }

  const all = scanForSecrets(pages);
  const confirmed = new Set(options.suppressKinds ?? []);
  const suppressed = all.filter((f) => isSuppressible(f.kind) && confirmed.has(f.kind));
  const findings = all.filter((f) => !suppressed.includes(f));
  if (findings.length > 0) {
    return {
      ok: false,
      code: "secrets_found",
      message: "Das Dokument enthält vermutlich Zugangsdaten und wurde nicht gespeichert. Bitte die Stellen schwärzen oder entfernen und erneut hochladen.",
      findings,
    };
  }
  return { ok: true, kind, mimeType, pages, pageCount: pages.length, suppressed };

  function unsupported(): UploadRejection {
    return { ok: false, code: "unsupported_type", message: "Erlaubt sind PDF (.pdf), Textdateien (.txt, .md) und Wiki-/Doku-Exporte (.json, .xml, .html), Typ und Endung müssen zusammenpassen." };
  }
}
