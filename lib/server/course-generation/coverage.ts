import { createHash } from "node:crypto";
import type { SourceReport } from "@/lib/server/db/schema";
import type { FetchedSource, SourceExcerpt } from "./sources";

/**
 * Abdeckung offizieller Lernziele (roadmap3.md, Schritt 2): erkennt in den Quelltexten eines Kurses die nummerierten
 * Lernziele („1.1 Compare …“, „Objective 2.3 …“, „Task Statement 3.2 …“, „101.1 …“), damit sich prüfen lässt, ob der Kurs
 * alle abdeckt. Deterministisch und ohne KI; erkennt nur nummerierte Gliederungen. Gibt es weniger als MIN_RECOGNISED
 * Treffer, gilt die Quelle als „nicht nummeriert“ und es gibt keine Aussage (statt einer falschen).
 */

export const MIN_RECOGNISED = 3;

export type OfficialObjective = { code: string; title: string };

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
/** Längstes passendes Zahlwort zuerst, damit „III“ nicht als „I“ erkannt wird. */
const ROMAN_PATTERN = Object.keys(ROMAN).sort((a, b) => b.length - a.length).join("|");
const LABEL = "(?:objective|objectives|task\\s+statement|task|skill|lernziel|prüfungsziel|pruefungsziel|thema)";
// Zeilenanfang, optionales Stichwort, Code (1–3 Stellen oder römisch I–X, Punkt, 1–2 Stellen; kein dritter Teil), dann Titel
// mit Buchstaben. Römisch nur in Großbuchstaben (das Stichwort darf klein sein, deshalb kein "i"-Schalter für den Code).
const LINE = new RegExp(`^\\s*(?:${LABEL}\\s+)?(\\d{1,3}\\.\\d{1,2}|(?:${ROMAN_PATTERN})\\.\\d{1,2})(?!\\.?\\d)[\\s.:)\\-–—]+([A-Za-zÄÖÜäöü][^\\n]{3,140})$`);
const LABEL_PREFIX = new RegExp(`^\\s*${LABEL}\\s+`, "i");
/**
 * Römisches Hauptkapitel am Zeilenanfang („I. Pflegeprozesse …“, Anlage 2 PflAPrV). Die darunter folgenden Punkte
 * „1. …“, „2. …“ werden zu „1.1“, „1.2“ (AP-2.2). Mit Punkt nach der Ziffer: „I think …“ ist kein Kapitel.
 */
const ROMAN_CHAPTER = new RegExp(`^\\s*(${ROMAN_PATTERN})\\.\\s+([A-ZÄÖÜ][^\\n]{3,300})$`);
const CHAPTER_ITEM = /^\s*(\d{1,2})\.\s+([A-Za-zÄÖÜäöü][^\n]{3,140})$/;
/** Ein gespeicherter Code ist lesbar, wenn er nur aus Zahlen mit Punkten besteht (ältere Berichte konnten „5.NaN.7“ enthalten). */
const CLEAN_CODE = /^\d+(?:\.\d+)*$/;
// Keine Lernziele, sondern Zahlen im Text: Einheiten, Versionen, Preise, Seiten.
const NOT_A_TITLE = /^(?:ghz|mhz|gb|mb|tb|kb|mbit|gbit|%|prozent|percent|euro|eur|usd|seite|page|abb|fig|tabelle|table|version|v\d|release|sec|min|ms)\b/i;

/**
 * Ein Code im Text: erstes Segment arabisch oder römisch (nur Großbuchstaben), weitere Segmente arabisch. Weder direkt vor
 * noch direkt nach dem Code darf ein Buchstabe oder eine Ziffer stehen: „K2 1.3“ liefert 1.3, „Objective“ kein „I“.
 */
const CODE_TOKEN = new RegExp(`(?<![A-Za-z0-9.])((?:\\d{1,4}|${ROMAN_PATTERN})(?:\\.\\d{1,4})*)(?!\\.?[A-Za-z0-9])`, "g");
/** Zwischen zwei Codes: ein Bereich („5.1–5.7“, „5.1 - 5.7“, „5.1 bis 5.7“, „5.1 to 5.7“). */
const RANGE_BETWEEN = /^\s*(?:–|—|-|bis|to)\s*$/i;
/** Obergrenze für aufgelöste Bereiche: „1.1–1.99“ ist ein Tippfehler, kein Kurs mit hundert Lernzielen. */
const MAX_RANGE = 30;

function segments(token: string): number[] {
  return token.split(".").map((p) => ROMAN[p] ?? Number(p));
}

function codeTokens(code: string): Array<{ segments: number[]; index: number; length: number }> {
  return [...code.matchAll(CODE_TOKEN)]
    .map((m) => ({ segments: segments(m[1]), index: m.index ?? 0, length: m[0].length }))
    .filter((t) => t.segments.every((n) => Number.isInteger(n)));
}

/**
 * Lernziel-Code ohne Zusätze, z. B. „1.2“. Führende Nullen entfallen („01.2“ → „1.2“), Kurzzeichen davor ebenso
 * („Objective 3.4“, „KF 4.4.0“ → „4.4.0“), römische Ziffern werden zu Zahlen („II.3“ → „2.3“). Ohne lesbaren Code
 * gibt es "" statt eines Codes mit „NaN“.
 */
export function normalizeCode(code: string): string {
  return codeTokens(code)[0]?.segments.join(".") ?? "";
}

/**
 * Alle Codes, die ein Lernziel des Kurses abdeckt. Ein Bereich „5.1–5.7“ (auch „5.1-7“, „5.1 bis 5.7“) steht für jedes
 * Lernziel dazwischen; ein Code, der sich nicht lesen lässt, deckt nichts ab (und erscheint nicht als „NaN“ im Bericht).
 */
export function expandCourseCode(code: string): string[] {
  const tokens = codeTokens(code);
  const [a, b] = tokens;
  if (!a) return [];
  const isRange = b !== undefined && RANGE_BETWEEN.test(code.slice(a.index + a.length, b.index));
  if (!isRange) return [a.segments.join(".")];
  const start = a.segments;
  // „5.1–7“: das Ende nennt nur den letzten Teil.
  const end = b.segments.length < start.length ? [...start.slice(0, start.length - b.segments.length), ...b.segments] : b.segments;
  const head = start.slice(0, -1);
  const sameHead = end.length === start.length && head.every((n, i) => n === end[i]);
  const first = start[start.length - 1];
  const last = end[end.length - 1];
  if (!sameHead || last < first || last - first >= MAX_RANGE) return [start.join("."), end.join(".")];
  return Array.from({ length: last - first + 1 }, (_, i) => [...head, first + i].join("."));
}

/** Nummerierte Lernziele aus den Quellenausschnitten; je Code der erste (längste Titel gewinnt bei Wiederholung). */
export function extractOfficialObjectives(excerpts: Array<Pick<SourceExcerpt, "text">>): OfficialObjective[] {
  const byCode = new Map<string, string>();
  const add = (rawCode: string, rawTitle: string) => {
    const title = rawTitle.trim().replace(/\s+/g, " ");
    if (NOT_A_TITLE.test(title) || /^\d/.test(title)) return;
    const code = normalizeCode(rawCode);
    if (!CLEAN_CODE.test(code)) return;
    const prev = byCode.get(code);
    if (!prev || title.length > prev.length) byCode.set(code, title);
  };
  // Aktuelles römisches Hauptkapitel (1–10) oder 0: nur darunter zählen „1. …“-Punkte als Lernziele.
  let chapter = 0;
  for (const e of excerpts) {
    for (const raw of e.text.split("\n")) {
      const line = raw.replace(/[`*_#>]/g, "").replace(/^[\s\-•·–]+/, "").trim();
      const m = LINE.exec(line.replace(LABEL_PREFIX, ""));
      if (m) {
        add(m[1], m[2]);
        continue;
      }
      const heading = ROMAN_CHAPTER.exec(line);
      if (heading) {
        chapter = ROMAN[heading[1]];
        continue;
      }
      const item = chapter > 0 ? CHAPTER_ITEM.exec(line) : null;
      if (item) add(`${chapter}.${Number(item[1])}`, item[2]);
    }
  }
  const sortKey = (c: string) => c.split(".").map((p) => p.padStart(4, "0")).join(".");
  return [...byCode.entries()].sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0]))).map(([code, title]) => ({ code, title: title.slice(0, 160) }));
}

export type CoverageResult =
  | { status: "not_numbered"; recognised: number }
  | { status: "ok"; recognised: number; covered: string[]; missing: OfficialObjective[]; extra: string[] };

/** Vergleich der offiziellen Lernziele mit den Lernziel-Codes des Kurses. */
export function compareCoverage(stored: OfficialObjective[], courseCodes: string[]): CoverageResult {
  // Ältere gespeicherte Berichte können unlesbare Codes („5.NaN.7“) enthalten: die zählen weder als Lernziel noch als Lücke.
  const official = stored.filter((o) => CLEAN_CODE.test(o.code));
  if (official.length < MIN_RECOGNISED) return { status: "not_numbered", recognised: official.length };
  const have = new Set(courseCodes.flatMap(expandCourseCode));
  const known = new Set(official.map((o) => o.code));
  return {
    status: "ok",
    recognised: official.length,
    covered: official.filter((o) => have.has(o.code)).map((o) => o.code),
    missing: official.filter((o) => !have.has(o.code)),
    extra: [...have].filter((c) => !known.has(c)),
  };
}

/**
 * Bericht über die Quellen eines Auftrags: erkannte offizielle Lernziele und gekürzte Quellen. Die Bilder-Beschreibungen
 * („Bild: …“) zählen nicht mit, sie sind KI-Text und keine Gliederung der Quelle.
 */
export function buildSourceReport(sources: FetchedSource[], now: Date = new Date(), skipped: Array<{ url: string; error: string }> = []): SourceReport {
  const main = sources.find((s) => s.primary) ?? null;
  // Offizielle Lernziele nur aus dem Prüfungsleitfaden (der als Blueprint markierten Quelle, sonst der mit den meisten
  // nummerierten Lernzielen, primarySourceIndex in sources.ts), wenn es einen gibt: Kapitelnummern aus Lehrbüchern, Prüferhandreichungen oder
  // Didaktik-Unterlagen („7.3 Feedback geben“) sind keine Lernziele der Prüfung.
  const excerpts = (main ? [main] : sources).flatMap((s) => s.excerpts.filter((e) => !e.locator.startsWith("Bild:")));
  const tracked = (main ? main.excerpts : excerpts).map((e) => e.text).join("\n");
  return {
    ...(skipped.length > 0 ? { skipped } : {}),
    fingerprint: createHash("sha256").update(tracked.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16),
    versions: detectExamVersions(tracked),
    checkedAt: now.toISOString(),
    officialObjectives: extractOfficialObjectives(excerpts),
    truncated: sources.filter((s) => s.truncated).map((s) => ({ title: s.title, url: s.url })),
    sourceCount: sources.length,
    primary: main ? { title: main.title, url: main.url, ...(main.primaryMarked ? { marked: true } : {}) } : null,
  };
}

/** Genannte Prüfungsversionen: Prüfungscodes wie „SY0-701“, „SAA-C03“, „AZ-104“ und „Version 7.0“ (höchstens fünf, in Reihenfolge). */
export function detectExamVersions(text: string): string[] {
  const found: string[] = [];
  const add = (v: string) => {
    if (!found.includes(v) && found.length < 5) found.push(v);
  };
  for (const m of text.matchAll(/\b([A-Z]{2,4}[0-9]?-[A-Z]?[0-9]{2,4})\b/g)) add(m[1]);
  for (const m of text.matchAll(/\b(?:Version|Exam version|Prüfungsversion|Versión)\s+([0-9]+(?:\.[0-9]+)?)\b/gi)) add(`Version ${m[1]}`);
  return found;
}

export type SourceChange = {
  /** Seit wann der Vergleichsstand gilt. */
  since: string;
  textChanged: boolean;
  added: OfficialObjective[];
  removed: OfficialObjective[];
  versionsBefore: string[];
  versionsNow: string[];
};

/** Unterschied des aktuellen Quellenberichts zum Vergleichsstand; null, wenn es keinen Vergleichsstand gibt oder nichts anders ist. */
export function sourceChange(report: SourceReport | null | undefined): SourceChange | null {
  const base = report?.baseline;
  if (!report || !base) return null;
  const before = new Set(base.officialObjectives.map((o) => o.code));
  const now = new Set(report.officialObjectives.map((o) => o.code));
  const added = report.officialObjectives.filter((o) => !before.has(o.code));
  const removed = base.officialObjectives.filter((o) => !now.has(o.code));
  const textChanged = Boolean(base.fingerprint && report.fingerprint && base.fingerprint !== report.fingerprint);
  const versionsNow = report.versions ?? [];
  const versionChanged = base.versions.length > 0 && versionsNow.length > 0 && base.versions.join("|") !== versionsNow.join("|");
  if (!textChanged && !added.length && !removed.length && !versionChanged) return null;
  return { since: base.checkedAt, textChanged, added, removed, versionsBefore: base.versions, versionsNow };
}

/** Vergleichsstand für einen neuen Bericht: der bisherige bleibt; ohne einen wird der vorige Bericht dazu. */
export function baselineFor(previous: SourceReport | null | undefined): SourceReport["baseline"] {
  if (!previous) return null;
  if (previous.baseline) return previous.baseline;
  return { checkedAt: previous.checkedAt, fingerprint: previous.fingerprint ?? null, officialObjectives: previous.officialObjectives, versions: previous.versions ?? [] };
}
