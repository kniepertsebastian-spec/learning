import { describe, expect, it } from "vitest";
import { validatePdfUpload } from "./sources";

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
