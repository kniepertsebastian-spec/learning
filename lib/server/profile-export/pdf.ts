import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { LearningProfilePayload } from "@/lib/server/db/schema";
import { verificationCode } from "./sign";

/** Die Standardschrift kennt nur WinAnsi (Latin-1): alles andere wird durch ein Fragezeichen ersetzt, damit die Erzeugung nie an einem Sonderzeichen scheitert. */
export function toWinAnsi(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?")
    .replace(/[\r\t]/g, " ");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of toWinAnsi(text).split(/\s+/).filter(Boolean)) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "UTC" });

/**
 * Lernprofil als PDF (A4): Name, Ausstellungsdatum, je Kurs das hinterlegte Zertifikat und der Lernstand, unten Kennung, Prüfcode und die Adresse der
 * Prüfseite. Zeilenumbruch und Seitenwechsel passieren hier selbst (pdf-lib setzt nichts um).
 */
export async function renderLearningProfilePdf(input: { id: string; issuedAt: Date; signature: string; payload: LearningProfilePayload; verifyUrl: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Lernprofil - Kenntnisnachweis");
  pdf.setProducer("Learning");
  pdf.setCreationDate(input.issuedAt);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.4, 0.4, 0.45);
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M + 70) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (value: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const f = opts.font ?? font;
    for (const line of wrap(value, f, size, W - 2 * M - (opts.indent ?? 0))) {
      ensure(size + 4);
      page.drawText(line, { x: M + (opts.indent ?? 0), y: y - size, size, font: f, color: opts.color ?? ink });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  text("Lernprofil - Kenntnisnachweis", { size: 20, font: bold, gap: 6 });
  text(`Ausgestellt für ${input.payload.holder}`, { size: 12, font: bold });
  text(`Ausgestellt am ${new Date(input.issuedAt).toLocaleDateString("de-DE", { timeZone: "UTC" })}`, { color: muted, gap: 14 });
  text("Aufgeführt sind nur Kurse, zu denen eine erfolgreiche Zertifikatsprüfung hinterlegt ist.", { color: muted, gap: 12 });

  for (const c of input.payload.courses) {
    ensure(90);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.84) });
    y -= 10;
    text(c.course, { size: 13, font: bold });
    text(`${c.certificate}${c.vendor ? ` (${c.vendor})` : ""}`, { indent: 0 });
    text(`Erworben am ${fmtDate(c.earnedAt)} · ${c.expiresAt ? `gültig bis ${fmtDate(c.expiresAt)}` : "unbegrenzt gültig"}`, { color: muted });
    text(`Lernstand im Kurs: ${c.chaptersCompleted} von ${c.chaptersTotal} Kapiteln abgeschlossen, ${c.lessonsDone} von ${c.lessonsTotal} Lektionen durchgearbeitet`, { color: muted, gap: 8 });
  }

  // Fußbereich auf der letzten Seite: Kennung, Prüfcode, Adresse der Prüfseite.
  const footerTop = M + 58;
  page.drawLine({ start: { x: M, y: footerTop }, end: { x: W - M, y: footerTop }, thickness: 0.5, color: rgb(0.7, 0.7, 0.75) });
  const small = (value: string, row: number, f: PDFFont = font) => page.drawText(toWinAnsi(value), { x: M, y: footerTop - 14 - row * 13, size: 9, font: f, color: muted });
  small("Echtheit prüfen:", 0, bold);
  small(`${input.verifyUrl}`, 1);
  small(`Kennung ${input.id} · Prüfcode ${verificationCode(input.signature)}`, 2);
  small("Ein Eintrag stimmt nur, wenn die Prüfseite dieselben Angaben und diesen Prüfcode zeigt.", 3);
  return pdf.save();
}
