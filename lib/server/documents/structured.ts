/**
 * Doku-Exporte als Quelle für interne Lernpfade: JSON (z. B. Wiki.js, GraphQL- oder Seiten-Export), XML (MediaWiki-
 * Export, allgemeines XML) und HTML. Jede Wiki-Seite wird zu einer „Seite“ mit Titel und Markdown-Text, damit jede
 * Seite ein eigener Quellenbeleg ist und die KI je Lernziel nur die passenden Seiten bekommt. Die KI und der
 * Secret-Scanner sehen NUR diesen umgewandelten Text, nie die Rohdatei.
 * Reine Funktionen ohne Datenbank; bewusst tolerant (kein vollständiger Parser), unbekannte Formen fallen auf
 * „alle Texte des Exports“ zurück.
 */

export class StructuredExportError extends Error {}

export type StructuredKind = "json" | "xml" | "html";
export type StructuredPage = { title: string; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const FENCE = "```";

/** Leerzeichen glätten (außerhalb von Codeblöcken), höchstens eine Leerzeile hintereinander. */
function normalize(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** HTML → Markdown-ähnlicher Text: Überschriften, Listen, Tabellen (Zellen mit „ | “), Codeblöcke bleiben erhalten. */
export function htmlToText(html: string): string {
  const blocks: string[] = [];
  let s = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    blocks.push(`${FENCE}\n${decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/^\n+|\n+$/g, "")}\n${FENCE}`);
    return `\n\n\u0000BLOCK${blocks.length - 1}\u0000\n\n`;
  });
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, inner: string) => `\n\n${"#".repeat(Number(n))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`);
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => `\`${inner.replace(/<[^>]+>/g, "")}\``);
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/gi, " | ").replace(/<\/tr>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|section|article|ul|ol|table|blockquote|figure|dl|dd|dt|header|footer)>/gi, "\n\n");
  s = s.replace(/<img\b[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, (_m, alt: string) => (alt.trim() ? ` [Bild: ${alt.trim()}] ` : " "));
  s = s.replace(/<[^>]+>/g, " ");
  s = normalize(decodeEntities(s));
  return s.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]);
}

/** MediaWiki-Wikitext → Markdown-ähnlicher Text (grob: Überschriften, Links, Listen, Code, Fettdruck). */
export function wikitextToText(wikitext: string): string {
  const blocks: string[] = [];
  let s = wikitext.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  s = s.replace(/<(syntaxhighlight|source|pre|code|nowiki)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag: string, inner: string) => {
    blocks.push(`${FENCE}\n${decodeEntities(inner).replace(/^\n+|\n+$/g, "")}\n${FENCE}`);
    return `\n\n\u0000BLOCK${blocks.length - 1}\u0000\n\n`;
  });
  s = s.replace(/\[\[(?:Category|Kategorie|File|Datei|Image|Bild):[^\]]*\]\]/gi, "");
  s = s.replace(/^(={1,6})\s*(.*?)\s*\1\s*$/gm, (_m, eq: string, t: string) => `\n${"#".repeat(eq.length)} ${t}\n`);
  s = s.replace(/'''''|'''|''/g, "");
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
  s = s.replace(/\[(?:https?:\/\/|\/\/)[^\s\]]+\s+([^\]]+)\]/g, "$1");
  s = s.replace(/^(\*+)\s*/gm, (_m, stars: string) => `${"  ".repeat(stars.length - 1)}- `).replace(/^#(?!#)\s+/gm, "1. ");
  s = s.replace(/^\{\|.*$|^\|\}$|^\|-.*$/gm, "").replace(/^[|!]\s*/gm, "").replace(/__[A-Z]+__/g, "").replace(/\{\{[^{}]*\}\}/g, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = normalize(decodeEntities(s));
  return s.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]);
}

const HTML_LIKE = /^\s*<(?:!doctype|html|body|p|div|h[1-6]|ul|ol|table|section|article)\b/i;

function textOf(body: string, hint: string | null, key: string): string {
  const isHtml = key === "html" || /html|ckeditor|wysiwyg/i.test(hint ?? "") || HTML_LIKE.test(body);
  return isHtml ? htmlToText(body) : body.replace(/\r\n/g, "\n").trim();
}

const BODY_KEYS = ["content", "body", "text", "markdown", "html", "wikitext", "source"] as const;
const TITLE_KEYS = ["title", "name", "pageTitle", "path", "slug"] as const;
const HINT_KEYS = ["contentType", "editor", "render", "format", "type"] as const;

function pageOf(o: Record<string, unknown>): StructuredPage | null {
  const bodyKey = BODY_KEYS.find((k) => typeof o[k] === "string" && (o[k] as string).trim().length > 0);
  const titleKey = TITLE_KEYS.find((k) => typeof o[k] === "string" && (o[k] as string).trim().length > 0);
  if (!bodyKey || !titleKey) return null;
  const hint = HINT_KEYS.map((k) => (typeof o[k] === "string" ? (o[k] as string) : "")).join(" ");
  const parts: string[] = [];
  if (typeof o.description === "string" && o.description.trim() && !(o[bodyKey] as string).includes(o.description.trim())) parts.push(o.description.trim());
  if (Array.isArray(o.tags)) {
    const tags = o.tags.map((t) => (typeof t === "string" ? t : t && typeof t === "object" ? ((t as Record<string, unknown>).tag ?? (t as Record<string, unknown>).title) : null)).filter((t): t is string => typeof t === "string" && t.length > 0);
    if (tags.length) parts.push(`Tags: ${tags.join(", ")}`);
  }
  parts.push(textOf(o[bodyKey] as string, hint, bodyKey));
  const text = parts.join("\n\n").trim();
  return text ? { title: (o[titleKey] as string).trim(), text } : null;
}

function collectPages(value: unknown, out: StructuredPage[], depth = 0): void {
  if (depth > 10 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collectPages(v, out, depth + 1);
    return;
  }
  const o = value as Record<string, unknown>;
  const page = pageOf(o);
  if (page) {
    out.push(page);
    return; // Inhalt der Seite nicht weiter durchsuchen
  }
  for (const v of Object.values(o)) collectPages(v, out, depth + 1);
}

function collectStrings(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.length >= 20 && t.split(/\s+/).length >= 3 && !/^https?:\/\/\S+$/.test(t)) out.add(t);
  } else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out, depth + 1));
}

/** JSON-Export (Wiki.js-Seite, Liste von Seiten, GraphQL-Antwort, allgemeines JSON). */
export function convertJson(raw: string): StructuredPage[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new StructuredExportError("Die JSON-Datei ist nicht gültig (Syntaxfehler).");
  }
  const pages: StructuredPage[] = [];
  collectPages(data, pages);
  if (pages.length > 0) return pages;
  const strings = new Set<string>();
  collectStrings(data, strings);
  if (strings.size === 0) throw new StructuredExportError("Im JSON wurden keine Seiteninhalte oder Texte gefunden. Bei Wiki.js bitte den Export MIT Seiteninhalt (content) wählen.");
  return [{ title: "Inhalt", text: [...strings].map((t) => `- ${t}`).join("\n") }];
}

function cdataOrText(inner: string): string {
  return inner.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, (_m, c: string) => c);
}

/** XML-Export: MediaWiki je Seite, sonst der gesamte Text (CDATA mit HTML wird umgewandelt). */
export function convertXml(raw: string): StructuredPage[] {
  if (!/<[a-zA-Z_][^>]*>/.test(raw)) throw new StructuredExportError("Die XML-Datei enthält keine Elemente.");
  if (/<mediawiki[\s>]/i.test(raw)) {
    const pages: StructuredPage[] = [];
    for (const m of raw.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/gi)) {
      const title = decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(m[1])?.[1] ?? "").trim();
      const texts = [...m[1].matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)];
      const wikitext = decodeEntities(cdataOrText(texts.at(-1)?.[1] ?? "")).trim();
      if (!title || !wikitext || /^#(?:REDIRECT|WEITERLEITUNG)/i.test(wikitext)) continue;
      const text = wikitextToText(wikitext);
      if (text) pages.push({ title, text });
    }
    if (pages.length > 0) return pages;
  }
  let s = raw.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => (/<\/?[a-z][^>]*>/i.test(c) ? `\n${htmlToText(c)}\n` : `\n${c}\n`));
  s = s.replace(/<\/[A-Za-z_][^>]*>/g, "\n").replace(/<[^>]+>/g, " ");
  let text = normalize(decodeEntities(s));
  // Inhalt war als &lt;p&gt;…-Text im XML verpackt: noch einmal als HTML lesen
  if (/<\/?(?:p|div|h[1-6]|ul|li|br|table)\b/i.test(text)) text = htmlToText(text);
  if (!text) throw new StructuredExportError("Im XML wurde kein Text gefunden.");
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1];
  return [{ title: title ? decodeEntities(cdataOrText(title)).trim() || "Inhalt" : "Inhalt", text }];
}

/** HTML-Datei (z. B. gespeicherte Wiki-Seite, Confluence-HTML). */
export function convertHtml(raw: string): StructuredPage[] {
  const title = decodeEntities(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? "").trim() || decodeEntities(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(raw)?.[1]?.replace(/<[^>]+>/g, "") ?? "").trim() || "Inhalt";
  const text = htmlToText(raw);
  if (!text) throw new StructuredExportError("Im HTML wurde kein Text gefunden.");
  return [{ title, text }];
}

export function convertStructuredExport(kind: StructuredKind, raw: string): StructuredPage[] {
  const pages = kind === "json" ? convertJson(raw) : kind === "xml" ? convertXml(raw) : convertHtml(raw);
  return pages.map((p) => ({ ...p, title: p.title.replace(/\s+/g, " ").slice(0, 80) }));
}

/** Endung → Art (nur diese Endungen sind als Export erlaubt). */
export function structuredKindOf(extension: string): StructuredKind | null {
  if (extension === "json") return "json";
  if (extension === "xml") return "xml";
  if (extension === "html" || extension === "htm") return "html";
  return null;
}

/** Kennung des gespeicherten MIME-Typs → Art. */
export function structuredKindOfMime(mimeType: string): StructuredKind | null {
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/xml") return "xml";
  if (mimeType === "text/html") return "html";
  return null;
}

/**
 * Export → nummerierte Seiten (eine je Wiki-Seite). Upload-Prüfung und Quellenaufbau nutzen genau diese Funktion,
 * damit Zeilennummern der Scanner-Funde und der Schwärzung übereinstimmen.
 */
export function structuredPages(kind: StructuredKind, raw: string): { pageNumber: number; title: string; text: string }[] {
  return convertStructuredExport(kind, raw).map((p, i) => ({
    pageNumber: i + 1,
    title: p.title,
    text: `# ${p.title}\n\n${p.text}`,
  }));
}
