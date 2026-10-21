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
export function buildSourceReport(sources: FetchedSource[], now: Date = new Date()): SourceReport {
  const excerpts = sources.flatMap((s) => s.excerpts.filter((e) => !e.locator.startsWith("Bild:")));
  return {
    checkedAt: now.toISOString(),
    officialObjectives: extractOfficialObjectives(excerpts),
    truncated: sources.filter((s) => s.truncated).map((s) => ({ title: s.title, url: s.url })),
    sourceCount: sources.length,
    primary: sources.filter((s) => s.primary).map((s) => ({ title: s.title, url: s.url }))[0] ?? null,
  };
}
