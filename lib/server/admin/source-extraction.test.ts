import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "./source-extraction";

async function buildTestPdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([300, 200]);
    page.drawText(text, { x: 20, y: 150, size: 14, font });
  }
  return Buffer.from(await doc.save());
}

describe("extractPdfPages", () => {
  it("extracts text per page with the correct page numbers, for a real generated PDF", async () => {
    const pdf = await buildTestPdf(["First page content", "Second page content"]);

    const pages = await extractPdfPages(pdf);

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain("First page content");
    expect(pages[1].pageNumber).toBe(2);
    expect(pages[1].text).toContain("Second page content");
  });

  it("returns one entry for a single-page PDF", async () => {
    const pdf = await buildTestPdf(["Only page"]);
    const pages = await extractPdfPages(pdf);
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("Only page");
  });
});
