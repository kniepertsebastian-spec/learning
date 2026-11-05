/**
 * Command-Palette (⌘K, docs/roadmaps/ROADMAP-UI.md „Später“): reine Such-Hilfen ohne Datenbank und Browser. Die Suche in der
 * Datenbank steht in lib/server/palette/search.ts, die Oberfläche in components/shell/CommandPalette.tsx.
 */

export type PaletteHitKind = "course" | "section" | "command";

/** Ein Treffer der Palette-Suche (vom Server geliefert, im Browser angezeigt). */
export interface PaletteHit {
  kind: PaletteHitKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;

/** Kleinbuchstaben, deutsche Umschrift (ä→ae, ö→oe, ü→ue, ß→ss) und ohne weitere Akzente: „Prüfer“ und „pruefer“ finden einander. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Suchbegriffe: getrimmt, in Wörter zerlegt, Doppelte weg, höchstens 6. */
export function queryTokens(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))].slice(0, 6);
}

/** Gültige Suche? Zu kurze Eingaben suchen nicht (sonst liefert jeder Buchstabe halbe Datenbank). */
export function normalizeQuery(query: string): string | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < MIN_QUERY_LENGTH) return null;
  return q.slice(0, MAX_QUERY_LENGTH);
}

/** Sonderzeichen für ILIKE entschärfen: `%`, `_` und `\` sind sonst Platzhalter. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Treffergüte eines Titels für die Reihenfolge: 3 = beginnt mit der Suche, 2 = ein Wort beginnt damit, 1 = kommt vor (alle Begriffe),
 * 0 = kein Treffer.
 */
export function scoreTitle(title: string, query: string): number {
  const text = fold(title);
  const q = fold(query).trim();
  if (!q) return 0;
  if (text.startsWith(q)) return 3;
  if (text.split(/[\s\-_/.:()]+/).some((word) => word.startsWith(q))) return 2;
  const tokens = queryTokens(query);
  return tokens.length > 0 && tokens.every((t) => text.includes(t)) ? 1 : 0;
}

/** Sortiert nach Güte (hoch zuerst), dann alphabetisch; Treffer ohne Güte entfallen. */
export function rankByTitle<T>(items: readonly T[], query: string, titleOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: scoreTitle(titleOf(item), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || titleOf(a.item).localeCompare(titleOf(b.item), undefined, { numeric: true }))
    .map((r) => r.item);
}

/**
 * Befehle aus einem Merkzettel (Markdown): Zeilen in Codeblöcken und Code in `Backticks`, die alle Suchbegriffe enthalten.
 * Gibt höchstens `limit` verschiedene Treffer zurück, jede auf 120 Zeichen gekürzt.
 */
export function extractCommands(markdown: string, query: string, limit = 3): string[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const found: string[] = [];
  const add = (raw: string) => {
    const line = raw.trim();
    if (!line || found.includes(line)) return;
    const folded = fold(line);
    if (tokens.every((t) => folded.includes(t))) found.push(line.length > 120 ? `${line.slice(0, 117)}...` : line);
  };
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) add(raw.replace(/^\s*[$#>]\s?/, ""));
    else for (const m of raw.matchAll(/`([^`\n]+)`/g)) add(m[1]);
    if (found.length >= limit) break;
  }
  return found.slice(0, limit);
}
