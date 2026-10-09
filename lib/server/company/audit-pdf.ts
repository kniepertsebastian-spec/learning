import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Einfaches PDF für den Audit-Export: Kopf (Firma, Datum, erstellt von) und Tabellen. Nur Zeichen der Standardschrift (WinAnsi). */
const clean = (s: string) => s.replace(/[^ -~ -ÿ–—’„“”]/g, "?").replace(/[–—]/g, "-").replace(/[’]/g, "'").replace(/[„“”]/g, '"');

export async function buildAuditPdf(input: { meta: { organization: string; createdAt: string; createdBy: string }; lines: Array<{ title: string; head: string[]; rows: string[][] }> }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 40;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (t: string, x: number, size: number, f = font) => page.drawText(clean(t), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });

  text("Zertifikats-Register - Audit-Export", M, 16, bold);
  y -= 22;
  text(`Firma: ${input.meta.organization}`, M, 10);
  y -= 14;
  text(`Erstellt am: ${input.meta.createdAt.slice(0, 10)} (Stichtag)  |  Erstellt von: ${input.meta.createdBy}`, M, 10);
  y -= 24;

  for (const block of input.lines) {
    ensure(40);
    text(block.title, M, 12, bold);
    y -= 18;
    const colW = (W - 2 * M) / block.head.length;
    const fit = (s: string) => {
      let out = clean(s);
      while (out.length > 1 && font.widthOfTextAtSize(out, 8) > colW - 6) out = out.slice(0, -1);
      return out;
    };
    block.head.forEach((h, i) => { text(fit(h), M + i * colW, 8, bold); });
    y -= 12;
    if (block.rows.length === 0) {
      text("(keine Eintraege)", M, 8);
      y -= 14;
    }
    for (const row of block.rows) {
      ensure(14);
      row.forEach((c, i) => { text(fit(c), M + i * colW, 8); });
      y -= 12;
    }
    y -= 14;
  }
  return pdf.save();
}
