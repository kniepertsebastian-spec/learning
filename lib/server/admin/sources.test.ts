import { describe, expect, it } from "vitest";
import { decodeMarkdown, isEditableMarkdownSource, isMarkdownUpload, validateMarkdownUpload, validatePdfUpload, validateSourceUrlShape } from "./sources";

function pdfBuffer(sizeBytes: number): Buffer {
  const buffer = Buffer.alloc(sizeBytes, 0x20);
  Buffer.from("%PDF-1.7\n").copy(buffer);
  return buffer;
}

describe("validatePdfUpload", () => {
  it("accepts a small file with the correct MIME type and PDF signature", () => {
    const data = pdfBuffer(1_024);
    expect(validatePdfUpload({ mimeType: "application/pdf", fileSizeBytes: data.byteLength, data })).toBeNull();
  });

  it("rejects an empty file", () => {
    const data = Buffer.alloc(0);
    const result = validatePdfUpload({ mimeType: "application/pdf", fileSizeBytes: 0, data });
    expect(result?.code).toBe("too_large");
  });

  it("rejects a file larger than the configured limit", () => {
    const data = pdfBuffer(1_024);
    const result = validatePdfUpload({
      mimeType: "application/pdf",
      fileSizeBytes: 26 * 1024 * 1024,
      data,
    });
    expect(result?.code).toBe("too_large");
  });

  it("rejects a wrong MIME type even if the bytes look like a PDF", () => {
    const data = pdfBuffer(1_024);
    const result = validatePdfUpload({
      mimeType: "application/octet-stream",
      fileSizeBytes: data.byteLength,
      data,
    });
    expect(result?.code).toBe("wrong_mime_type");
  });

  it("rejects a spoofed MIME type when the bytes are not actually a PDF", () => {
    const data = Buffer.from("this is definitely not a PDF file");
    const result = validatePdfUpload({
      mimeType: "application/pdf",
      fileSizeBytes: data.byteLength,
      data,
    });
    expect(result?.code).toBe("invalid_pdf_signature");
  });
});

describe("validateSourceUrlShape", () => {
  it("accepts a well-formed https URL", () => {
    expect(validateSourceUrlShape("https://example.org/exam-guide.pdf")).toBeNull();
  });

  it("accepts a well-formed http URL", () => {
    expect(validateSourceUrlShape("http://example.org/exam-guide.pdf")).toBeNull();
  });

  it("rejects a syntactically invalid URL", () => {
    expect(validateSourceUrlShape("not a url")?.code).toBe("invalid_url");
  });

  it("rejects a non-http(s) scheme", () => {
    expect(validateSourceUrlShape("file:///etc/passwd")?.code).toBe("invalid_url");
    expect(validateSourceUrlShape("ftp://example.org/doc.pdf")?.code).toBe("invalid_url");
    expect(validateSourceUrlShape("javascript:alert(1)")?.code).toBe("invalid_url");
  });
});

function markdownInput(text: string | Buffer, mimeType = "text/markdown") {
  const data = typeof text === "string" ? Buffer.from(text, "utf-8") : text;
  return { mimeType, fileSizeBytes: data.byteLength, data };
}

describe("isMarkdownUpload", () => {
  it("erkennt Markdown an der Endung, egal in welcher Schreibweise und was der Browser als Typ meldet", () => {
    expect(isMarkdownUpload({ name: "leitfaden.md", type: "" })).toBe(true);
    expect(isMarkdownUpload({ name: "Leitfaden.MD", type: "text/plain" })).toBe(true);
    expect(isMarkdownUpload({ name: "notes.markdown", type: "application/octet-stream" })).toBe(true);
  });

  it("erkennt Markdown am MIME-Type, wenn die Endung fehlt", () => {
    expect(isMarkdownUpload({ name: "leitfaden", type: "text/markdown" })).toBe(true);
    expect(isMarkdownUpload({ name: "leitfaden", type: "text/x-markdown" })).toBe(true);
  });

  it("hält PDFs und beliebigen Text nicht für Markdown", () => {
    expect(isMarkdownUpload({ name: "guide.pdf", type: "application/pdf" })).toBe(false);
    expect(isMarkdownUpload({ name: "readme.txt", type: "text/plain" })).toBe(false);
    expect(isMarkdownUpload({ name: "md", type: "" })).toBe(false);
  });
});

describe("validateMarkdownUpload", () => {
  it("akzeptiert UTF-8-Text mit Umlauten bei den üblichen MIME-Types der Browser", () => {
    for (const mimeType of ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream", ""]) {
      expect(validateMarkdownUpload(markdownInput("# Prüfungsziele\n\nGrößen und Maße", mimeType))).toBeNull();
    }
  });

  it("lehnt leere und nur aus Leerraum bestehende Dateien ab", () => {
    expect(validateMarkdownUpload({ mimeType: "text/markdown", fileSizeBytes: 0, data: Buffer.alloc(0) })?.code).toBe("empty");
    expect(validateMarkdownUpload(markdownInput(" \n\t\n"))?.code).toBe("empty");
  });

  it("lehnt zu große Dateien ab", () => {
    const data = Buffer.from("# x");
    expect(validateMarkdownUpload({ mimeType: "text/markdown", fileSizeBytes: 6 * 1024 * 1024, data })?.code).toBe("too_large");
  });

  it("lehnt andere MIME-Types ab, auch wenn die Datei .md heißt", () => {
    expect(validateMarkdownUpload(markdownInput("# x", "application/pdf"))?.code).toBe("wrong_mime_type");
    expect(validateMarkdownUpload(markdownInput("# x", "image/png"))?.code).toBe("wrong_mime_type");
  });

  it("lehnt Binärdaten und kein gültiges UTF-8 ab", () => {
    expect(validateMarkdownUpload(markdownInput(Buffer.from("%PDF-1.7\n\0\0binär")))?.code).toBe("not_text");
    // „Prüfung“ in Latin-1: das ü ist ein einzelnes Byte und in UTF-8 ungültig.
    expect(validateMarkdownUpload(markdownInput(Buffer.from("Pr\xfcfung", "latin1")))?.code).toBe("not_text");
  });
});

describe("decodeMarkdown", () => {
  it("entfernt die Byte-Order-Mark und vereinheitlicht die Zeilenenden", () => {
    const data = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# Titel\r\nText\rEnde")]);
    expect(decodeMarkdown(data)).toBe("# Titel\nText\nEnde");
  });

  it("wirft bei ungültigem UTF-8, statt Ersatzzeichen zu erzeugen", () => {
    expect(() => decodeMarkdown(Buffer.from("Pr\xfcfung", "latin1"))).toThrow();
  });
});

describe("isEditableMarkdownSource", () => {
  it("erlaubt Bearbeiten nur für Markdown und nur vor Prüfung und Freigabe", () => {
    for (const status of ["uploaded", "parsed", "failed"] as const) {
      expect(isEditableMarkdownSource({ sourceType: "markdown", status })).toBe(true);
    }
    for (const status of ["reviewed", "approved", "superseded"] as const) {
      expect(isEditableMarkdownSource({ sourceType: "markdown", status })).toBe(false);
    }
    expect(isEditableMarkdownSource({ sourceType: "pdf", status: "parsed" })).toBe(false);
    expect(isEditableMarkdownSource({ sourceType: "url", status: "uploaded" })).toBe(false);
  });
});
