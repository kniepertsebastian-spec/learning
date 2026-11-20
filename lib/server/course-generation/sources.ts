import { extractPdfPages } from "@/lib/server/admin/source-extraction";
import { splitIntoSections, type SourceExcerpt } from "@/lib/server/documents/sections";
import { fetchUrlSafely, UrlFetchError } from "@/lib/server/network/fetch-url";
import { UnsafeUrlError } from "@/lib/server/network/ssrf-guard";
import { extractOfficialObjectives, MIN_RECOGNISED } from "./coverage";

// Ausschnitte und Abschnittszerlegung liegen in documents/sections.ts; hier bleiben sie unter dem bisherigen Namen erreichbar.
export { splitIntoSections, type SourceExcerpt };

export class SourceFetchError extends Error {}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
/** Bewusst knapp gehalten wie buildSourceText() in lib/server/admin/blueprint.ts
 * (Kostenschutz + Kontextgrenze), pro Quelle statt für alle Quellen zusammen. */
const MAX_EXCERPT_CHARS_PER_SOURCE = 60_000;
/**
 * Der Prüfungsleitfaden (die Quelle mit den meisten nummerierten Lernzielen) wird nicht bei 60.000 Zeichen gekappt: aus
 * ihm kommen Gliederung und Abdeckungsprüfung, ein abgeschnittener Rest hieße fehlende Lernziele. Nur eine großzügige
 * Sicherheitsgrenze bleibt (etwa 400 PDF-Seiten Text).
 */
export const PRIMARY_SOURCE_MAX_CHARS = Number(process.env.COURSE_GEN_PRIMARY_SOURCE_MAX_CHARS) || 400_000;

export interface FetchedSource {
  id: string;
  title: string;
  url: string;
  retrievedAt: string;
  excerpts: SourceExcerpt[];
  truncated: boolean;
  /** Hinweise zur Aufbereitung (z. B. ein ausgelassenes Bild), nie Inhalt. */
  warnings?: string[];
  /** Als Prüfungsleitfaden erkannt (meiste nummerierte Lernziele): mit PRIMARY_SOURCE_MAX_CHARS statt der normalen Grenze. */
  primary?: boolean;
}

/** Grobe HTML-Text-Extraktion für Nicht-PDF-Quellen - bewusst einfach
 * (Hobbyprojekt-Scope, siehe course_generation.md Abschnitt 22), kein
 * vollständiger Readability-Parser. Entfernt Skripte/Styles, Navigation, Fußbereiche, Seitenleisten, Formulare
 * und Kommentare (token_architektur_roadmap Stufe 0: Ballast kostet Eingabe-Token und lenkt ab) sowie die Tags,
 * lässt Absätze als Zeilenumbrüche erkennbar. */
export function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
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

/** Kappt die Ausschnitte einer Quelle bei MAX_EXCERPT_CHARS_PER_SOURCE (Kostenschutz). */
export function capExcerpts(excerpts: SourceExcerpt[], maxChars = MAX_EXCERPT_CHARS_PER_SOURCE): { excerpts: SourceExcerpt[]; truncated: boolean } {
  let truncated = false;
  let budget = maxChars;
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
export async function fetchSource(id: string, url: string, maxChars = MAX_EXCERPT_CHARS_PER_SOURCE): Promise<FetchedSource> {
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

  const { excerpts: cappedExcerpts, truncated } = capExcerpts(excerpts, maxChars);

  return {
    id,
    title: url,
    url,
    retrievedAt: new Date().toISOString(),
    excerpts: cappedExcerpts,
    truncated,
  };
}

/**
 * Index der Quelle, die der Prüfungsleitfaden ist: die mit den meisten nummerierten Lernzielen (mindestens
 * MIN_RECOGNISED), sonst keine (-1).
 */
export function primarySourceIndex(sources: Array<Pick<FetchedSource, "excerpts">>): number {
  let best = -1;
  let bestCount = MIN_RECOGNISED - 1;
  sources.forEach((s, i) => {
    const n = extractOfficialObjectives(s.excerpts).length;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  });
  return best;
}

/** Der Prüfungsleitfaden unter den Quellen wird bis PRIMARY_SOURCE_MAX_CHARS gelesen, die übrigen werden wie bisher gekappt. */
export function markPrimaryAndCap(full: FetchedSource[]): FetchedSource[] {
  const primary = primarySourceIndex(full);
  return full.map((source, i) => {
    // Eine früher (z. B. nur unter den Adressen) als Leitfaden markierte Quelle verliert die Markierung, wenn eine andere gewinnt.
    const rest: FetchedSource = { ...source };
    delete rest.primary;
    if (i === primary) return { ...rest, primary: true };
    const { excerpts, truncated } = capExcerpts(source.excerpts);
    return { ...rest, excerpts, truncated: source.truncated || truncated };
  });
}

/** Alle Quellen abrufen, sonst Fehler: eine einzige kaputte Quelle bricht ab. Für den Vergleich mit dem Stand der Kurserstellung („Quelle prüfen“), der nur mit allen Quellen stimmt. */
export async function fetchSources(urls: string[]): Promise<FetchedSource[]> {
  const full = await Promise.all(urls.map((url, index) => fetchSource(`src-${index + 1}`, url, PRIMARY_SOURCE_MAX_CHARS)));
  return markPrimaryAndCap(full);
}

/** Eine Quelle, die sich nicht verwenden ließ: Adresse und Grund (kurz, nie Inhalt). */
export interface SkippedSource {
  url: string;
  error: string;
}

export interface FetchSourcesResult {
  sources: FetchedSource[];
  skipped: SkippedSource[];
}

/** Fehlermeldung des Preflights, wenn keine der Quellen brauchbar war: bei einer einzigen deren Grund, sonst eine Liste. */
export function noUsableSourceMessage(skipped: SkippedSource[]): string {
  if (skipped.length === 1) return skipped[0].error;
  const shown = skipped.slice(0, 5).map((s) => `${s.url}: ${s.error}`).join("; ");
  const more = skipped.length > 5 ? ` (und ${skipped.length - 5} weitere)` : "";
  return `Keine der ${skipped.length} Quellen ließ sich verwenden - ${shown}${more}`;
}

/** Kurze, anzeigbare Fehlermeldung zu einem gescheiterten Abruf. */
export function describeFetchError(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : "Unbekannter Fehler beim Abruf.";
  return message.slice(0, 300);
}

/**
 * Alle Quellen abrufen und die funktionierenden verwenden: Scheitert eine (nicht erreichbar, zu wenig Text, defektes PDF),
 * wird sie übersprungen und gemeldet, statt den ganzen Auftrag abzubrechen. Wie viele übrig bleiben, entscheidet der Aufrufer
 * (der Worker bricht nur ab, wenn keine einzige brauchbar ist). Die Kennungen („src-3“) folgen der Stelle in der Eingabe und
 * bleiben deshalb auch dann stabil, wenn davor eine Quelle ausfällt.
 */
export async function fetchSourcesTolerant(urls: string[], fetchOne: typeof fetchSource = fetchSource): Promise<FetchSourcesResult> {
  const settled = await Promise.allSettled(urls.map((url, index) => fetchOne(`src-${index + 1}`, url, PRIMARY_SOURCE_MAX_CHARS)));
  const fetched: FetchedSource[] = [];
  const skipped: SkippedSource[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") fetched.push(result.value);
    else skipped.push({ url: urls[index], error: describeFetchError(result.reason) });
  });
  return { sources: markPrimaryAndCap(fetched), skipped };
}
