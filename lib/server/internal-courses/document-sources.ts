import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { companyDocumentFiles, companyDocumentImages, companyDocuments, courseGenerationJobDocuments } from "@/lib/server/db/schema";
import { extractPdfPages } from "@/lib/server/documents/pdf-text";
import { structuredKindOfMime, structuredPages, StructuredExportError } from "@/lib/server/documents/structured";
import { scanForSecrets } from "@/lib/server/documents/secret-scanner";
import type { ImageDescriber } from "./vision";
import { capExcerpts, capTotalChars, splitIntoSections, type FetchedSource } from "@/lib/server/course-generation/sources";

/** Das Dokument darf (noch) nicht für die KI verwendet werden. Die Meldung ist für die Firma bestimmt. */
export class DocumentSourceError extends Error {}

/** Mindestmenge verwertbarer Zeichen: ein paar Stichwörter genügen. */
export const MIN_USABLE_CHARS = 30;

export const REDACTION_MARKER = "[Zeile entfernt: vom Scanner gemeldet]";

type Page = { pageNumber: number; text: string };
type Suppressed = { kind: string; pageNumber: number; line: number }[];

/**
 * Schwärzt genau die Zeilen, deren Scanner-Funde ein Firmen-Admin als Fehlalarm bestätigt hat (Seite und Zeile sind
 * am Dokument gespeichert, nie der Wert). Diese Zeilen gehen nie an die KI. Zeilennummern zählen wie im Scanner
 * (je Seite, ab 1, getrennt an Zeilenumbrüchen).
 */
export function redactSuppressedLines(pages: Page[], suppressed: Suppressed | null): Page[] {
  if (!suppressed?.length) return pages;
  const byPage = new Map<number, Set<number>>();
  for (const f of suppressed) byPage.set(f.pageNumber, (byPage.get(f.pageNumber) ?? new Set()).add(f.line));
  return pages.map((page) => {
    const lines = byPage.get(page.pageNumber);
    if (!lines) return page;
    const text = page.text
      .split(/\r?\n/)
      .map((line, index) => (lines.has(index + 1) ? REDACTION_MARKER : line))
      .join("\n");
    return { ...page, text };
  });
}

/**
 * Lädt den Text eines Firmendokuments als Quelle für den KI-Schritt. Das Dokument muss zur Firma gehören (Filter
 * immer nach Organisation), darf nicht von der KI-Verarbeitung ausgeschlossen sein, bestätigte Fehlalarme werden
 * geschwärzt, und als Sicherheitsnetz wird der Text nach dem Schwärzen erneut gescannt: bleibt ein Fund übrig,
 * geht nichts an die KI.
 */
export async function loadDocumentSources(
  organizationId: string,
  documentId: string,
  /** Beschreibt Screenshots als Text. Ohne Angabe bleiben angehängte Bilder unberücksichtigt. */
  describeImage?: ImageDescriber,
  options: {
    /** Bei mehreren Dateien je Kurs: Dateiname vor jedem Verweis (sonst heißt jede Datei „Abschnitt 1“ und die KI kann sie nicht auseinanderhalten). */
    locatorPrefix?: string;
    sourceId?: string;
    /** Mindestmenge Text in DIESER Datei (bei mehreren Dateien zählt die Summe, eine leere Datei darf dabei sein). */
    minChars?: number;
  } = {},
): Promise<FetchedSource[]> {
  const [row] = await getDb()
    .select({
      title: companyDocuments.title,
      mimeType: companyDocuments.mimeType,
      excludeFromAi: companyDocuments.excludeFromAi,
      suppressed: companyDocuments.scannerSuppressed,
      data: companyDocumentFiles.data,
    })
    .from(companyDocuments)
    .innerJoin(companyDocumentFiles, eq(companyDocumentFiles.documentId, companyDocuments.id))
    .where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new DocumentSourceError("Das Dokument gibt es nicht mehr.");
  if (row.excludeFromAi) throw new DocumentSourceError("Dieses Dokument ist von der KI-Verarbeitung ausgeschlossen.");

  let pages: Page[];
  let locator: (pageNumber: number) => string;
  if (row.mimeType === "application/pdf") {
    pages = (await extractPdfPages(Buffer.from(row.data))).map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    locator = (n) => `S. ${n}`;
  } else if (structuredKindOfMime(row.mimeType)) {
    let converted: ReturnType<typeof structuredPages>;
    try {
      converted = structuredPages(structuredKindOfMime(row.mimeType)!, Buffer.from(row.data).toString("utf-8"));
    } catch (err) {
      if (err instanceof StructuredExportError) throw new DocumentSourceError(err.message);
      throw err;
    }
    pages = converted.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    const titles = new Map(converted.map((p) => [p.pageNumber, p.title]));
    locator = (n) => `Seite ${n}: ${titles.get(n) ?? ""}`.trim();
  } else {
    pages = [{ pageNumber: 1, text: Buffer.from(row.data).toString("utf-8") }];
    locator = () => "Abschnitt 1";
  }

  // Bestätigte Fehlalarme sind nach Seite und Zeile vermerkt: erst schwärzen, dann zerlegen.
  pages = redactSuppressedLines(pages, row.suppressed);
  if (row.mimeType !== "application/pdf" && !structuredKindOfMime(row.mimeType)) {
    // Fließtext (Markdown, Text): in Abschnitte zerlegen, damit jedes Lernziel nur seinen Teil bekommt statt des ganzen
    // Dokuments (siehe splitIntoSections).
    const sectionsOfText = splitIntoSections(pages[0]?.text ?? "");
    pages = sectionsOfText.map((section, index) => ({ pageNumber: index + 1, text: section.text }));
    locator = (n) => sectionsOfText[n - 1]?.locator ?? `Abschnitt ${n}`;
  }
  if (scanForSecrets(pages).length > 0) {
    throw new DocumentSourceError(
      "Im Dokument stehen noch Zugangsdaten oder Schlüssel, die nicht als Fehlalarm bestätigt sind. Es geht nicht an die KI.",
    );
  }

  const withPrefix = (base: string) => (options.locatorPrefix ? `${options.locatorPrefix} · ${base}` : base);
  const excerpts = pages.map((p) => ({ locator: withPrefix(locator(p.pageNumber)), text: p.text }));
  const warnings: string[] = [];
  if (describeImage) {
    excerpts.push(...(await describeImages(organizationId, documentId, describeImage, warnings)).map((e) => ({ ...e, locator: withPrefix(e.locator) })));
  }
  const usable = excerpts.reduce((n, e) => n + e.text.replace(REDACTION_MARKER, "").trim().length, 0);
  // Auch eine kurze Stichwortliste reicht als Gliederung (die KI ergänzt dann die Erklärungen); völlig leer nicht.
  if (usable < (options.minChars ?? MIN_USABLE_CHARS)) throw new DocumentSourceError("Das Dokument enthält zu wenig Text für einen Lernpfad.");

  const capped = capExcerpts(excerpts);
  return [
    {
      id: options.sourceId ?? "doc-1",
      title: row.title,
      url: `dokument:${documentId}`,
      retrievedAt: new Date().toISOString(),
      excerpts: capped.excerpts,
      truncated: capped.truncated,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  ];
}

/**
 * Screenshots des Dokuments als Text. Die Beschreibung der KI läuft durch denselben Secret-Scanner wie Dokumenttext:
 * ein Fund, eine leere Antwort oder ein Fehler lassen nur dieses Bild weg (mit Hinweis), nie den ganzen Lauf scheitern.
 */
async function describeImages(organizationId: string, documentId: string, describe: ImageDescriber, warnings: string[]) {
  const images = await getDb()
    .select({ filename: companyDocumentImages.filename, mimeType: companyDocumentImages.mimeType, data: companyDocumentImages.data })
    .from(companyDocumentImages)
    .where(and(eq(companyDocumentImages.documentId, documentId), eq(companyDocumentImages.organizationId, organizationId)))
    .orderBy(asc(companyDocumentImages.createdAt));
  const out: { locator: string; text: string }[] = [];
  for (const image of images) {
    let text: string;
    try {
      text = (await describe({ mimeType: image.mimeType, data: Buffer.from(image.data), filename: image.filename })).trim();
    } catch {
      warnings.push(`Bild „${image.filename}“ konnte nicht gelesen werden und wurde ausgelassen.`);
      continue;
    }
    if (!text || /^KEIN INHALT\.?$/i.test(text)) {
      warnings.push(`Auf dem Bild „${image.filename}“ war nichts Lesbares zu erkennen.`);
      continue;
    }
    if (scanForSecrets([{ pageNumber: 1, text }]).length > 0) {
      warnings.push(`Auf dem Bild „${image.filename}“ stehen vermutlich Zugangsdaten; es wurde nicht verwendet.`);
      continue;
    }
    out.push({ locator: `Bild: ${image.filename}`, text });
  }
  return out;
}

/** Höchstmenge Text über alle Dateien eines Kurses (Kostenschutz; je Datei gilt zusätzlich die Grenze von capExcerpts). */
export const MAX_TOTAL_SOURCE_CHARS = 480_000;

/**
 * Quellen eines Kursauftrags: eine oder viele Dateien (temporär hochgeladen oder gespeicherte Dokumente). Bei einer Datei
 * wie bisher; bei mehreren trägt jeder Verweis den Dateinamen, eine zu kleine Datei ist erlaubt (es zählt die Summe) und
 * die Gesamtmenge wird gedeckelt, mit Hinweis. Ein Fund des Scanners oder ein ausgeschlossenes Dokument stoppt den ganzen Auftrag.
 */
export async function loadJobSources(organizationId: string, jobId: string, describeImage?: ImageDescriber, legacyDocumentId?: string | null): Promise<FetchedSource[]> {
  const links = await getDb()
    .select({ documentId: courseGenerationJobDocuments.documentId })
    .from(courseGenerationJobDocuments)
    .where(eq(courseGenerationJobDocuments.jobId, jobId))
    .orderBy(asc(courseGenerationJobDocuments.orderNum));
  const ids = links.length > 0 ? links.map((l) => l.documentId) : legacyDocumentId ? [legacyDocumentId] : [];
  if (ids.length === 0) throw new DocumentSourceError("Dem Auftrag sind keine Dateien zugeordnet.");
  if (ids.length === 1) return loadDocumentSources(organizationId, ids[0], describeImage);

  const sources: FetchedSource[] = [];
  const used = new Map<string, number>();
  for (const [i, documentId] of ids.entries()) {
    const [doc] = await getDb().select({ title: companyDocuments.title }).from(companyDocuments).where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.organizationId, organizationId))).limit(1);
    if (!doc) throw new DocumentSourceError("Eine der Dateien gibt es nicht mehr.");
    const seen = (used.get(doc.title) ?? 0) + 1;
    used.set(doc.title, seen);
    const prefix = seen === 1 ? doc.title : `${doc.title} (${seen})`;
    try {
      sources.push(...(await loadDocumentSources(organizationId, documentId, describeImage, { locatorPrefix: prefix, sourceId: `doc-${i + 1}`, minChars: 0 })));
    } catch (error) {
      if (error instanceof DocumentSourceError) throw new DocumentSourceError(`${doc.title}: ${error.message}`);
      throw error;
    }
  }
  const usable = sources.reduce((n, s) => n + s.excerpts.reduce((m, e) => m + e.text.replace(REDACTION_MARKER, "").trim().length, 0), 0);
  if (usable < MIN_USABLE_CHARS) throw new DocumentSourceError("Die Dateien enthalten zu wenig Text für einen Kurs.");
  return capTotalChars(sources, MAX_TOTAL_SOURCE_CHARS);
}
