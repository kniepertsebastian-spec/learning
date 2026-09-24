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
}

/** Grobe HTML-Text-Extraktion für Nicht-PDF-Quellen - bewusst einfach
 * (Hobbyprojekt-Scope, siehe course_generation.md Abschnitt 22), kein
 * vollständiger Readability-Parser. Entfernt Skripte/Styles und Tags, lässt
 * Absätze als Zeilenumbrüche erkennbar. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
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
    excerpts = [{ locator: "Abschnitt 1", text }];
  }

  const usableChars = excerpts.reduce((sum, e) => sum + e.text.trim().length, 0);
  if (usableChars < 200) {
    throw new SourceFetchError(
      `Quelle "${url}" enthält zu wenig verwertbaren Text (${usableChars} Zeichen) - Preflight abgebrochen.`,
    );
  }

  let truncated = false;
  let budget = MAX_EXCERPT_CHARS_PER_SOURCE;
  const cappedExcerpts: SourceExcerpt[] = [];
  for (const excerpt of excerpts) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    if (excerpt.text.length > budget) {
      cappedExcerpts.push({ locator: excerpt.locator, text: excerpt.text.slice(0, budget) });
      truncated = true;
      budget = 0;
    } else {
      cappedExcerpts.push(excerpt);
      budget -= excerpt.text.length;
    }
  }

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
