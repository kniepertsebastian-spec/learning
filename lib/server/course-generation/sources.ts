import { extractPdfPages } from "@/lib/server/admin/source-extraction";
import { splitIntoSections, type SourceExcerpt } from "@/lib/server/documents/sections";
import { fetchUrlSafely, looksLikePdf, UrlFetchError, type FetchedUrlContent } from "@/lib/server/network/fetch-url";
import { UnsafeUrlError } from "@/lib/server/network/ssrf-guard";
import { extractOfficialObjectives, MIN_RECOGNISED } from "./coverage";
import { isUploadRef, loadCourseGenerationUpload } from "./uploads";

// Ausschnitte und Abschnittszerlegung liegen in documents/sections.ts; hier bleiben sie unter dem bisherigen Namen erreichbar.
export { splitIntoSections, type SourceExcerpt };

export class SourceFetchError extends Error {}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const envChars = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

/**
 * Mindestanteil je Quelle (Fachquelle, nicht der Prüfungsleitfaden). So viel bekommt jede Quelle immer, auch wenn das
 * Gesamtbudget schon voll ist - der frühere feste Deckel, bewusst knapp wie buildSourceText() in lib/server/admin/blueprint.ts.
 */
export const MIN_EXCERPT_CHARS_PER_SOURCE = 60_000;
/**
 * Höchstanteil je Fachquelle (COURSE_GEN_MAX_SOURCE_CHARS, Standard 120.000). Unterhalb davon verteilt fitSourceBudget()
 * das freie Gesamtbudget fair: kleine Quellen bleiben ganz, große teilen sich den Rest (Quellen-Roadmap AP-3.2).
 */
export const MAX_EXCERPT_CHARS_PER_SOURCE = Math.max(MIN_EXCERPT_CHARS_PER_SOURCE, envChars("COURSE_GEN_MAX_SOURCE_CHARS", 120_000));
/**
 * Gesamtbudget des Quellenpakets in Zeichen (COURSE_GEN_FULL_CONTEXT_MAX_CHARS, Standard 400.000 ≈ 100.000 Token). Bis zu
 * dieser Größe bekommt jedes Lernziel das komplette Paket und trifft den günstigen impliziten Gemini-Cache (worker.ts,
 * shouldUseFullSourceContext). Aus Kostengründen bewusst nicht höher (Quellen-Roadmap AP-3.2, Abschnitt 3).
 */
export const FULL_CONTEXT_MAX_CHARS = envChars("COURSE_GEN_FULL_CONTEXT_MAX_CHARS", 400_000);
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
  /** Der Prüfungsleitfaden (markiert oder erkannt): mit PRIMARY_SOURCE_MAX_CHARS statt der normalen Grenze. */
  primary?: boolean;
  /** Im Assistenten ausdrücklich als Blueprint markiert, nicht nur an den meisten Lernziel-Nummern erkannt. */
  primaryMarked?: boolean;
}

/**
 * Mindestmenge Text (nach dem Entfernen der Tags) in <main>/<article>, damit nur dieser Block gelesen wird. Darunter ist der
 * Block vermutlich nur ein Teaser oder leer (Inhalt per JavaScript), dann zählt die ganze Seite.
 */
export const MIN_MAIN_CONTENT_CHARS = 500;

/**
 * Hauptinhalt einer HTML-Seite (Quellen-Roadmap AP-3.1): das erste <main> (bzw. role="main"), sonst alle <article> zusammen,
 * wenn darin genug Text steht. Navigationsleisten, Breadcrumbs, Seitenleisten und Cookie-Banner in <div>-Containern außerhalb
 * fallen damit weg. Ohne passenden Block: null (dann die ganze Seite).
 */
export function mainContentHtml(html: string): string | null {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(withoutComments)?.[1] ?? roleMainContent(withoutComments);
  if (main !== null && visibleTextLength(main) >= MIN_MAIN_CONTENT_CHARS) return main;
  const articles = [...withoutComments.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]).join("\n");
  if (articles && visibleTextLength(articles) >= MIN_MAIN_CONTENT_CHARS) return articles;
  return null;
}

/** Länge des sichtbaren Texts eines HTML-Ausschnitts (ohne Skripte, Styles und Tags, Leerraum zusammengefasst). */
function visibleTextLength(fragment: string): number {
  return fragment
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Inhalt von `<div role="main">…</div>` (oder section) bis zum passenden schließenden Tag; verschachtelte werden mitgezählt. */
function roleMainContent(html: string): string | null {
  const open = /<(div|section)\b[^>]*\brole\s*=\s*["']?main["']?[^>]*>/i.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tags = new RegExp(`<(/?)${open[1]}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
}

/** Grobe HTML-Text-Extraktion für Nicht-PDF-Quellen - bewusst einfach
 * (Hobbyprojekt-Scope, siehe course_generation.md Abschnitt 22), kein
 * vollständiger Readability-Parser. Liest bevorzugt nur den Hauptinhalt (mainContentHtml). Entfernt Skripte/Styles,
 * Navigation, Fußbereiche, Seitenleisten, Formulare und Kommentare (token_architektur_roadmap Stufe 0: Ballast kostet
 * Eingabe-Token und lenkt ab) sowie die Tags, lässt Absätze als Zeilenumbrüche erkennbar. */
export function stripHtml(html: string): string {
  return (mainContentHtml(html) ?? html)
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

/** Kappt die Ausschnitte einer Quelle (Kostenschutz); ohne Angabe beim Mindestanteil MIN_EXCERPT_CHARS_PER_SOURCE. */
export function capExcerpts(excerpts: SourceExcerpt[], maxChars = MIN_EXCERPT_CHARS_PER_SOURCE): { excerpts: SourceExcerpt[]; truncated: boolean } {
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
 * gekappt bei `maxChars` (Standard MIN_EXCERPT_CHARS_PER_SOURCE; Kostenschutz, wie
 * buildSourceText() in lib/server/admin/blueprint.ts).
 */
export async function fetchSource(id: string, url: string, maxChars = MIN_EXCERPT_CHARS_PER_SOURCE): Promise<FetchedSource> {
  // Hochgeladene Datei (im Assistenten neben den Links): Text liegt schon gelesen in der Datenbank.
  if (isUploadRef(url)) {
    const upload = await loadCourseGenerationUpload(url);
    if (!upload) throw new SourceFetchError("Die hochgeladene Datei gibt es nicht mehr. Bitte erneut hochladen.");
    const usable = upload.excerpts.reduce((sum, e) => sum + e.text.trim().length, 0);
    if (usable < 200) throw new SourceFetchError(`Datei "${upload.filename}" enthält zu wenig verwertbaren Text (${usable} Zeichen).`);
    const { excerpts, truncated } = capExcerpts(upload.excerpts, maxChars);
    return { id, title: upload.filename, url, retrievedAt: new Date().toISOString(), excerpts, truncated };
  }
  let fetched: FetchedUrlContent;
  try {
    fetched = await fetchUrlSafely(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_SOURCE_BYTES,
    });
  } catch (error) {
    if (error instanceof UrlFetchError || error instanceof UnsafeUrlError) {
      throw new SourceFetchError(error.message);
    }
    throw error;
  }

  const { buffer } = fetched;
  const isPdf = looksLikePdf(fetched, url);
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
 * Index der Quelle, die der Prüfungsleitfaden ist. Vorrang hat die im Assistenten markierte Quelle (`markedUrl`, AP-2.1),
 * sofern sie abgerufen werden konnte; sonst die mit den meisten nummerierten Lernzielen (mindestens MIN_RECOGNISED), sonst
 * keine (-1).
 */
export function primarySourceIndex(sources: Array<Pick<FetchedSource, "excerpts"> & { url?: string }>, markedUrl?: string | null): number {
  if (markedUrl) {
    const marked = sources.findIndex((s) => s.url === markedUrl);
    if (marked >= 0) return marked;
  }
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

const sizeOf = (excerpts: SourceExcerpt[] | undefined) => (excerpts ?? []).reduce((n, e) => n + e.text.length, 0);

/** Wie viel jede Quelle behalten darf: Grenze je Quelle, Summe der behaltenen Zeichen und das Gesamtbudget. */
export interface SourceBudgetPlan {
  /** Zeichengrenze je Quelle (Index wie die Eingabe); beim Leitfaden PRIMARY_SOURCE_MAX_CHARS. */
  limits: number[];
  /** Summe der Zeichen nach dem Kappen. */
  totalChars: number;
  budgetChars: number;
}

/**
 * Verteilt das Gesamtbudget (AP-3.2): Der Prüfungsleitfaden behält bis PRIMARY_SOURCE_MAX_CHARS, der Rest des Budgets geht
 * fair an die übrigen Quellen („Wasserstand“: kleine bleiben ganz, die großen teilen sich, was übrig ist), jede bekommt
 * dabei mindestens MIN_EXCERPT_CHARS_PER_SOURCE und höchstens MAX_EXCERPT_CHARS_PER_SOURCE. Reicht das Budget wegen der
 * Mindestanteile nicht, wird es überschritten; der Worker schaltet dann auf gezielte Ausschnitte um.
 */
export function fitSourceBudget(sizes: number[], primary: number, budget = FULL_CONTEXT_MAX_CHARS): SourceBudgetPlan {
  const primaryChars = primary >= 0 ? Math.min(sizes[primary], PRIMARY_SOURCE_MAX_CHARS) : 0;
  const others = sizes.map((size, i) => ({ size, i })).filter((o) => o.i !== primary).sort((a, b) => a.size - b.size);
  let remaining = Math.max(0, budget - primaryChars);
  let level = MAX_EXCERPT_CHARS_PER_SOURCE;
  for (let k = 0; k < others.length; k++) {
    const share = remaining / (others.length - k);
    if (others[k].size <= share) {
      remaining -= others[k].size;
      continue;
    }
    level = Math.floor(share);
    break;
  }
  const cap = Math.min(MAX_EXCERPT_CHARS_PER_SOURCE, Math.max(MIN_EXCERPT_CHARS_PER_SOURCE, level));
  const limits = sizes.map((_, i) => (i === primary ? PRIMARY_SOURCE_MAX_CHARS : cap));
  const totalChars = sizes.reduce((n, size, i) => n + Math.min(size, limits[i]), 0);
  return { limits, totalChars, budgetChars: budget };
}

/** Den Prüfungsleitfaden markieren und alle Quellen nach fitSourceBudget() kappen. */
function markPrimaryAndCap(full: FetchedSource[], markedUrl?: string | null): FetchedSource[] {
  const primary = primarySourceIndex(full, markedUrl);
  const { limits } = fitSourceBudget(full.map((s) => sizeOf(s.excerpts)), primary);
  return full.map((source, i) => {
    const { excerpts, truncated } = capExcerpts(source.excerpts, limits[i]);
    const marked = i === primary && !!markedUrl && source.url === markedUrl;
    return {
      ...source,
      excerpts,
      truncated: source.truncated || truncated,
      ...(i === primary ? { primary: true } : {}),
      ...(marked ? { primaryMarked: true } : {}),
    };
  });
}

/**
 * Alle Quellen abrufen, sonst Fehler: eine einzige kaputte Quelle bricht ab. Für den Vergleich mit dem Stand der
 * Kurserstellung („Quelle prüfen“), der nur mit allen Quellen stimmt. `markedUrl`: die als Blueprint markierte Quelle.
 */
export async function fetchSources(urls: string[], markedUrl?: string | null): Promise<FetchedSource[]> {
  const full = await Promise.all(urls.map((url, index) => fetchSource(`src-${index + 1}`, url, PRIMARY_SOURCE_MAX_CHARS)));
  return markPrimaryAndCap(full, markedUrl);
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
export async function fetchSourcesTolerant(urls: string[], fetchOne: typeof fetchSource = fetchSource, markedUrl?: string | null): Promise<FetchSourcesResult> {
  const settled = await Promise.allSettled(urls.map((url, index) => fetchOne(`src-${index + 1}`, url, PRIMARY_SOURCE_MAX_CHARS)));
  const fetched: FetchedSource[] = [];
  const skipped: SkippedSource[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") fetched.push(result.value);
    else skipped.push({ url: urls[index], error: describeFetchError(result.reason) });
  });
  return { sources: markPrimaryAndCap(fetched, markedUrl), skipped };
}
