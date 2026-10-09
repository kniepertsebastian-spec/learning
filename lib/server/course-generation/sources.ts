import { extractPdfPages } from "@/lib/server/admin/source-extraction";
import { fetchUrlSafely, UrlFetchError } from "@/lib/server/network/fetch-url";
import { UnsafeUrlError } from "@/lib/server/network/ssrf-guard";

export class SourceFetchError extends Error {}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
/** Bewusst knapp gehalten wie buildSourceText() in lib/server/admin/blueprint.ts
 * (Kostenschutz + Kontextgrenze), pro Quelle statt für alle Quellen zusammen. */
const MAX_EXCERPT_CHARS_PER_SOURCE = 60_000;

export interface SourceExcerpt {
  /** Seiten-/Abschnittsbezug, z. B. "S. 4" (PDF) oder "Abschnitt 1" (Text/HTML). */
  locator: string;
  text: string;
}

export interface FetchedSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  excerpts: SourceExcerpt[];
  truncated: boolean;
  /** Hinweise zur Aufbereitung (z. B. ein ausgelassenes Bild), nie Inhalt. */
  warnings?: string[];
}

/** Grobe HTML-Text-Extraktion für Nicht-PDF-Quellen - bewusst einfach
 * (Hobbyprojekt-Scope, siehe course_generation.md Abschnitt 22), kein
 * vollständiger Readability-Parser. Entfernt Skripte/Styles und Tags, lässt
 * Absätze als Zeilenumbrüche erkennbar. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Überschriften bleiben als Markdown-Überschrift erkennbar: daran zerlegt splitIntoSections() den Text.
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SECTION_MIN_CHARS = 800;
const SECTION_MAX_CHARS = 6_000;

/**
 * Zerlegt einen Fließtext (HTML nach stripHtml, Markdown, Text) in Abschnitte mit eigenem Locator
 * („Abschnitt 3: Backups“). Vorher war jede Text-/HTML-Quelle EIN Ausschnitt „Abschnitt 1“: der Blueprint konnte so
 * keinem Lernziel einen Teil zuordnen, und JEDES Lernziel bekam die ganze Quelle (bis zur Höchstmenge) erneut als
 * Eingabe. Getrennt wird an Überschriften (ab SECTION_MIN_CHARS Zeichen) und, wenn ein Abschnitt zu lang wird, an
 * Absatzgrenzen. Kurze Texte bleiben ein Abschnitt.
 */
export function splitIntoSections(text: string, maxChars = SECTION_MAX_CHARS, minChars = SECTION_MIN_CHARS): SourceExcerpt[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [{ locator: "Abschnitt 1", text: trimmed }];

  const chunks: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; lines: string[]; size: number } = { heading: null, lines: [], size: 0 };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body) chunks.push({ heading: current.heading, text: body });
    current = { heading: null, lines: [], size: 0 };
  };
  const headingOf = (line: string) => /^\s*#{1,6}\s+(\S.*)$/.exec(line)?.[1]?.trim() ?? null;

  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = headingOf(line);
    if (heading && current.size >= minChars) flush();
    // Eine Überschrift benennt den Abschnitt, solange er noch leer ist (auch statt eines „(Forts.)“-Namens).
    if (heading && (current.heading === null || current.lines.length === 0)) current.heading = heading;
    // Zu lang: an der nächsten Leerzeile (Absatzende) trennen; eine einzelne Riesenzeile wird hart geteilt.
    if (current.size >= maxChars && line.trim() === "") {
      const carry = current.heading;
      flush();
      current.heading = carry ? `${carry} (Forts.)` : null;
      continue;
    }
    if (line.length > maxChars) {
      for (let start = 0; start < line.length; start += maxChars) {
        current.lines.push(line.slice(start, start + maxChars));
        current.size += Math.min(maxChars, line.length - start);
        if (current.size >= maxChars) flush();
      }
      continue;
    }
    current.lines.push(line);
    current.size += line.length + 1;
  }
  flush();

  return chunks.map((chunk, index) => ({
    locator: `Abschnitt ${index + 1}${chunk.heading ? `: ${chunk.heading.replace(/[#*`_[\]]/g, "").slice(0, 60).trim()}` : ""}`,
    text: chunk.text,
  }));
}

/** Kappt die Ausschnitte einer Quelle bei MAX_EXCERPT_CHARS_PER_SOURCE (Kostenschutz). */
export function capExcerpts(excerpts: SourceExcerpt[]): { excerpts: SourceExcerpt[]; truncated: boolean } {
  let truncated = false;
  let budget = MAX_EXCERPT_CHARS_PER_SOURCE;
  const capped: SourceExcerpt[] = [];
  for (const excerpt of excerpts) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    if (excerpt.text.length > budget) {
      capped.push({ locator: excerpt.locator, text: excerpt.text.slice(0, budget) });
      truncated = true;
      budget = 0;
    } else {
      capped.push(excerpt);
      budget -= excerpt.text.length;
    }
  }
  return { excerpts: capped, truncated };
}

/**
 * Deckelt die Gesamtmenge Text über mehrere Quellen. Passt alles, bleibt alles; sonst bekommt jede Quelle ihren Anteil
 * (mindestens 2.000 Zeichen), der Rest einer Quelle wird abgeschnitten und mit Hinweis vermerkt.
 */
export function capTotalChars(sources: FetchedSource[], maxTotal: number): FetchedSource[] {
  const size = (s: FetchedSource) => s.excerpts.reduce((n, e) => n + e.text.length, 0);
  const total = sources.reduce((n, s) => n + size(s), 0);
  if (total <= maxTotal) return sources;
  return sources.map((source) => {
    const allowance = Math.max(2_000, Math.floor((maxTotal * size(source)) / total));
    if (size(source) <= allowance) return source;
    let budget = allowance;
    const excerpts: SourceExcerpt[] = [];
    for (const e of source.excerpts) {
      if (budget <= 0) break;
      excerpts.push(e.text.length > budget ? { locator: e.locator, text: e.text.slice(0, budget) } : e);
      budget -= e.text.length;
    }
    return {
      ...source,
      excerpts,
      truncated: true,
      warnings: [...(source.warnings ?? []), `„${source.title}“ wurde gekürzt, weil alle Dateien zusammen sehr viel Text sind.`],
    };
  });
}

/**
 * Gate A (course_generation.md Abschnitt 3.4): "Erreichbarkeit und erlaubte
 * Dateitypen der Quellen" + "erfolgreiche Text- und PDF-Extraktion" +
 * "Mindestmenge verwertbaren Quelltexts" - ruft eine einzelne Quell-URL ab
 * und liefert seitenweise/abschnittsweise referenzierbare Ausschnitte,
 * gekappt bei MAX_EXCERPT_CHARS_PER_SOURCE (Kostenschutz, wie
 * buildSourceText() in lib/server/admin/blueprint.ts).
 */
export async function fetchSource(id: string, url: string): Promise<FetchedSource> {
  let contentType: string;
  let buffer: Buffer;
  try {
    ({ buffer, contentType } = await fetchUrlSafely(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_SOURCE_BYTES,
    }));
  } catch (error) {
    if (error instanceof UrlFetchError || error instanceof UnsafeUrlError) {
      throw new SourceFetchError(error.message);
    }
    throw error;
  }

  const isPdf = contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf");
  let excerpts: SourceExcerpt[];
  if (isPdf) {
    const pages = await extractPdfPages(buffer);
    excerpts = pages.map((page) => ({ locator: `S. ${page.pageNumber}`, text: page.text }));
  } else {
    const text = stripHtml(buffer.toString("utf-8"));
    excerpts = splitIntoSections(text);
  }

  const usableChars = excerpts.reduce((sum, e) => sum + e.text.trim().length, 0);
  if (usableChars < 200) {
    throw new SourceFetchError(
      `Quelle "${url}" enthält zu wenig verwertbaren Text (${usableChars} Zeichen) - Preflight abgebrochen.`,
    );
  }

  const { excerpts: cappedExcerpts, truncated } = capExcerpts(excerpts);

  return {
    id,
    title: url,
    url,
    retrievedAt: new Date().toISOString(),
    excerpts: cappedExcerpts,
    truncated,
  };
}

export async function fetchSources(urls: string[]): Promise<FetchedSource[]> {
  return Promise.all(urls.map((url, index) => fetchSource(`src-${index + 1}`, url)));
}
