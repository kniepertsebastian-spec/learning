import { extractPdfPages, type ExtractedPage } from "./pdf-text";
import { scanForSecrets, type SecretFinding } from "./secret-scanner";

/** Höchstgröße eines Firmendokuments. Die Datei liegt in der Datenbank, deshalb bewusst kleiner als bei Lernquellen. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Weniger Text als das gilt bei PDFs als „kein durchsuchbarer Text“ (z. B. eingescannte Seiten). */
export const MIN_PDF_TEXT_CHARS = 20;

export type DocumentKind = "pdf" | "text";

export type UploadRejection =
  | { ok: false; code: "empty" | "too_large" | "unsupported_type" | "invalid_content" | "unreadable" | "no_text"; message: string }
  | { ok: false; code: "secrets_found"; message: string; findings: SecretFinding[] };

export type UploadInspection =
  | { ok: true; kind: DocumentKind; mimeType: string; pages: ExtractedPage[]; pageCount: number }
  | UploadRejection;

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
export async function inspectUpload(input: { filename: string; mimeType: string; data: Buffer }): Promise<UploadInspection> {
  const { data } = input;
  if (data.byteLength === 0) return { ok: false, code: "empty", message: "Die Datei ist leer." };
  if (data.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, code: "too_large", message: `Die Datei ist größer als ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.` };
  }

  const ext = extensionOf(input.filename);
  const mime = input.mimeType.trim().toLowerCase();
  let kind: DocumentKind;
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

  const findings = scanForSecrets(pages);
  if (findings.length > 0) {
    return {
      ok: false,
      code: "secrets_found",
      message: "Das Dokument enthält vermutlich Zugangsdaten und wurde nicht gespeichert. Bitte die Stellen schwärzen oder entfernen und erneut hochladen.",
      findings,
    };
  }
  return { ok: true, kind, mimeType, pages, pageCount: pages.length };

  function unsupported(): UploadRejection {
    return { ok: false, code: "unsupported_type", message: "Erlaubt sind PDF (.pdf) und Textdateien (.txt, .md), Typ und Endung müssen zusammenpassen." };
  }
}
