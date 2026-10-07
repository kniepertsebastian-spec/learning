import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { companyDocumentFiles, companyDocuments } from "@/lib/server/db/schema";
import { extractPdfPages } from "@/lib/server/documents/pdf-text";
import { structuredKindOfMime, structuredPages, StructuredExportError } from "@/lib/server/documents/structured";
import { scanForSecrets } from "@/lib/server/documents/secret-scanner";
import { capExcerpts, type FetchedSource } from "@/lib/server/course-generation/sources";

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
export async function loadDocumentSources(organizationId: string, documentId: string): Promise<FetchedSource[]> {
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

  pages = redactSuppressedLines(pages, row.suppressed);
  if (scanForSecrets(pages).length > 0) {
    throw new DocumentSourceError(
      "Im Dokument stehen noch Zugangsdaten oder Schlüssel, die nicht als Fehlalarm bestätigt sind. Es geht nicht an die KI.",
    );
  }

  const excerpts = pages.map((p) => ({ locator: locator(p.pageNumber), text: p.text }));
  const usable = excerpts.reduce((n, e) => n + e.text.replace(REDACTION_MARKER, "").trim().length, 0);
  // Auch eine kurze Stichwortliste reicht als Gliederung (die KI ergänzt dann die Erklärungen); völlig leer nicht.
  if (usable < MIN_USABLE_CHARS) throw new DocumentSourceError("Das Dokument enthält zu wenig Text für einen Lernpfad.");

  const capped = capExcerpts(excerpts);
  return [
    {
      id: "doc-1",
      title: row.title,
      url: `dokument:${documentId}`,
      retrievedAt: new Date().toISOString(),
      excerpts: capped.excerpts,
      truncated: capped.truncated,
    },
  ];
}
