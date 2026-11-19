import type { FetchedSource, SourceExcerpt } from "./sources";

/**
 * Stufe 0 der token_architektur_roadmap: Quellen bereinigen und mit eindeutigen IDs (`SRC_01` … `SRC_30`) rahmen.
 *
 * Die ID einer Quelle folgt ihrer Stelle in der Eingabe („src-3“ bzw. „doc-3“ → `SRC_03`) und bleibt damit auch dann
 * gleich, wenn bei einem erneuten Versuch eine Quelle davor ausfällt: Das gespeicherte Curriculum (sourceIds je Lernziel)
 * und die Belege `[SRC_03]` in fertigen Lektionen passen dann weiter.
 */

export type TaggedExcerpt = SourceExcerpt & { sourceId?: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** `SRC_NN` je Quelle (Schlüssel: FetchedSource.id). Doppelte Nummern (z. B. „src-1“ und „doc-1“) bekommen die nächste freie. */
export function assignCitationIds(sources: Array<Pick<FetchedSource, "id">>): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<number>();
  sources.forEach((source, index) => {
    const fromId = Number(/(\d+)$/.exec(source.id)?.[1]);
    let n = Number.isInteger(fromId) && fromId > 0 ? fromId : index + 1;
    while (used.has(n)) n++;
    used.add(n);
    ids.set(source.id, `SRC_${pad(n)}`);
  });
  return ids;
}

/**
 * Wiederkehrender Ballast einer Quelle: Kopf- und Fußzeilen, die auf (fast) jeder Seite stehen („Seite 3 von 40“,
 * „© 2026 Firma – Vertraulich“, Navigationszeilen). Eine Zeile gilt als Ballast, wenn sie in mindestens drei Ausschnitten
 * und in mindestens der Hälfte aller Ausschnitte vorkommt. Code (Zeilen ohne Buchstaben, Klammern) bleibt immer stehen.
 */
export function stripRepeatedBoilerplate(excerpts: SourceExcerpt[]): SourceExcerpt[] {
  if (excerpts.length < 3) return excerpts;
  const normalize = (line: string) => line.trim().replace(/\d+/g, "#").replace(/\s+/g, " ").toLowerCase();
  const counts = new Map<string, number>();
  for (const excerpt of excerpts) {
    const lines = new Set(excerpt.text.split("\n").map(normalize).filter((l) => l.length >= 6 && l.length <= 160 && /\p{L}{3}/u.test(l)));
    for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(excerpts.length / 2));
  const boilerplate = new Set([...counts.entries()].filter(([, n]) => n >= threshold).map(([line]) => line));
  if (boilerplate.size === 0) return excerpts;
  return excerpts.map((excerpt) => {
    const text = excerpt.text
      .split("\n")
      .filter((line) => !boilerplate.has(normalize(line)))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text === excerpt.text ? excerpt : { ...excerpt, text };
  });
}

/** Bereinigt alle Quellen (siehe stripRepeatedBoilerplate) und lässt leere Ausschnitte weg. */
export function cleanSources(sources: FetchedSource[]): FetchedSource[] {
  return sources.map((source) => {
    const excerpts = stripRepeatedBoilerplate(source.excerpts).filter((e) => e.text.trim().length > 0);
    return excerpts.length > 0 ? { ...source, excerpts } : source;
  });
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/\n/g, " ");

/** Text einer Quelle darf das Rahmen-Tag nicht schließen können (Prompt-Injection über „</source>“). */
const neutralizeTags = (text: string) => text.replace(/<\/?source\b/gi, (m) => m.replace("<", "‹"));

function sourceBlock(id: string, title: string, excerpts: SourceExcerpt[]): string {
  return [`<source id="${id}" title="${escapeAttr(title)}">`, ...excerpts.map((e) => `[${e.locator}]\n${neutralizeTags(e.text)}`), "</source>"].join("\n");
}

/**
 * Das komplette, ID-getaggte Quellenpaket. Es ist für alle Aufrufe eines Kurses Zeichen für Zeichen gleich und steht am
 * Anfang jeder Anfrage: So rechnet Gemini es ab dem zweiten Aufruf über das implizite Caching zum Cache-Preis ab.
 */
export function formatSourcePack(sources: FetchedSource[], ids = assignCitationIds(sources)): string {
  return sources.map((source) => sourceBlock(ids.get(source.id) ?? source.id, source.title, source.excerpts)).join("\n\n");
}

/** Ausgewählte Ausschnitte (Auszugs-Modus), nach Quelle gruppiert und genauso gerahmt wie das ganze Paket. */
export function formatTaggedExcerpts(excerpts: TaggedExcerpt[], titles: Map<string, string> = new Map()): string {
  if (excerpts.length === 0) return "(keine)";
  const groups = new Map<string, TaggedExcerpt[]>();
  for (const excerpt of excerpts) {
    const key = excerpt.sourceId ?? "SRC_00";
    groups.set(key, [...(groups.get(key) ?? []), excerpt]);
  }
  return [...groups.entries()].map(([id, list]) => sourceBlock(id, titles.get(id) ?? id, list)).join("\n\n");
}

/** Gesamtlänge des Pakets in Zeichen (grob 4 Zeichen je Token). */
export function sourcePackChars(sources: FetchedSource[]): number {
  return sources.reduce((n, s) => n + s.excerpts.reduce((m, e) => m + e.text.length + e.locator.length + 3, 0) + s.title.length + 40, 0);
}

/** Alle Ausschnitte mit der ID ihrer Quelle (für Validierung und Auszugs-Modus). */
export function taggedExcerpts(sources: FetchedSource[], ids = assignCitationIds(sources)): TaggedExcerpt[] {
  return sources.flatMap((source) => source.excerpts.map((e) => ({ ...e, sourceId: ids.get(source.id) })));
}

/** Quellenbelege im Text: `[SRC_07]`, auch gesammelt `[SRC_04, SRC_12]`. */
export const CITATION_PATTERN = /\[(SRC_\d+(?:\s*[,;]\s*SRC_\d+)*)\]/g;
/** Markierung einer Lücke: `[QUELLE FEHLT: kurze Beschreibung]`. */
export const MISSING_SOURCE_PATTERN = /\[QUELLE FEHLT:\s*([^\]]*)\]/g;

/** Alle zitierten Quellen-IDs eines Textes, normiert auf zwei Stellen (`SRC_7` → `SRC_07`). */
export function citedSourceIds(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    for (const id of match[1].split(/\s*[,;]\s*/)) out.push(normalizeCitationId(id));
  }
  return out;
}

export function normalizeCitationId(id: string): string {
  const n = Number(/(\d+)$/.exec(id)?.[1]);
  return Number.isInteger(n) ? `SRC_${pad(n)}` : id;
}

export function countMissingSourceMarkers(text: string): number {
  return (text.match(MISSING_SOURCE_PATTERN) ?? []).length;
}

/**
 * Ersetzt Belege auf Quellen, die es nicht gibt (`[SRC_31]` bei 30 Quellen), durch eine Lücken-Markierung: Die Aussage ist
 * dann nicht belegt, und genau das soll sichtbar bleiben, statt den Verweis still zu löschen. Gültige IDs im selben
 * Sammelbeleg bleiben stehen.
 */
export function replaceUnknownCitations(text: string, known: Set<string>): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const out = text.replace(CITATION_PATTERN, (_all, group: string) => {
    const ids = group.split(/\s*[,;]\s*/).map(normalizeCitationId);
    const ok = ids.filter((id) => known.has(id));
    const bad = ids.filter((id) => !known.has(id));
    unknown.push(...bad);
    if (bad.length === 0) return `[${ids.join(", ")}]`;
    const missing = `[QUELLE FEHLT: Beleg verweist auf unbekannte Quelle ${bad.join(", ")}]`;
    return ok.length > 0 ? `[${ok.join(", ")}] ${missing}` : missing;
  });
  return { text: out, unknown };
}
