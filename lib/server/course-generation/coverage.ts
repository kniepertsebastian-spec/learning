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

const LABEL = "(?:objective|objectives|task\\s+statement|task|skill|lernziel|prüfungsziel|pruefungsziel|thema)";
// Zeilenanfang, optionales Stichwort, Code (1–3 Stellen, Punkt, 1–2 Stellen; kein dritter Teil), dann Titel mit Buchstaben.
const LINE = new RegExp(`^\\s*(?:${LABEL}\\s+)?(\\d{1,3}\\.\\d{1,2})(?!\\.?\\d)[\\s.:)\\-–—]+([A-Za-zÄÖÜ][^\\n]{3,140})$`, "i");
// Keine Lernziele, sondern Zahlen im Text: Einheiten, Versionen, Preise, Seiten.
const NOT_A_TITLE = /^(?:ghz|mhz|gb|mb|tb|kb|mbit|gbit|%|prozent|percent|euro|eur|usd|seite|page|abb|fig|tabelle|table|version|v\d|release|sec|min|ms)\b/i;

/** Lernziel-Code ohne Zusätze, z. B. „1.2“. Führende Nullen entfallen („01.2“ → „1.2“). */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .replace(/^(?:objective|task\s+statement|task|lernziel)\s+/i, "")
    .split(".")
    .map((p) => String(Number(p)))
    .join(".");
}

/** Nummerierte Lernziele aus den Quellenausschnitten; je Code der erste (längste Titel gewinnt bei Wiederholung). */
export function extractOfficialObjectives(excerpts: Array<Pick<SourceExcerpt, "text">>): OfficialObjective[] {
  const byCode = new Map<string, string>();
  for (const e of excerpts) {
    for (const raw of e.text.split("\n")) {
      const m = LINE.exec(raw.replace(/[`*_#>]/g, "").replace(/^[\s\-•·–]+/, "").trim());
      if (!m) continue;
      const title = m[2].trim().replace(/\s+/g, " ");
      if (NOT_A_TITLE.test(title) || /^\d/.test(title)) continue;
      const code = normalizeCode(m[1]);
      const prev = byCode.get(code);
      if (!prev || title.length > prev.length) byCode.set(code, title);
    }
  }
  const sortKey = (c: string) => c.split(".").map((p) => p.padStart(4, "0")).join(".");
  return [...byCode.entries()].sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0]))).map(([code, title]) => ({ code, title: title.slice(0, 160) }));
}

export type CoverageResult =
  | { status: "not_numbered"; recognised: number }
  | { status: "ok"; recognised: number; covered: string[]; missing: OfficialObjective[]; extra: string[] };

/** Vergleich der offiziellen Lernziele mit den Lernziel-Codes des Kurses. */
export function compareCoverage(official: OfficialObjective[], courseCodes: string[]): CoverageResult {
  if (official.length < MIN_RECOGNISED) return { status: "not_numbered", recognised: official.length };
  const have = new Set(courseCodes.map(normalizeCode));
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
  const excerpts = sources.flatMap((s) => s.excerpts.filter((e) => !e.locator.startsWith("Bild:")));
  const main = sources.find((s) => s.primary) ?? null;
  const tracked = (main ? main.excerpts : excerpts).map((e) => e.text).join("\n");
  return {
    ...(skipped.length > 0 ? { skipped } : {}),
    fingerprint: createHash("sha256").update(tracked.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16),
    versions: detectExamVersions(tracked),
    checkedAt: now.toISOString(),
    officialObjectives: extractOfficialObjectives(excerpts),
    truncated: sources.filter((s) => s.truncated).map((s) => ({ title: s.title, url: s.url })),
    sourceCount: sources.length,
    primary: sources.filter((s) => s.primary).map((s) => ({ title: s.title, url: s.url }))[0] ?? null,
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
