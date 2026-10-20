/**
 * Einlesen einer Gehaltstabelle der Entgeltstatistik der Bundesagentur für Arbeit (als CSV gespeichert). Läuft im Browser
 * (Vorschau im Admin-Bereich) und auf dem Server (Import) gleich. Die genaue Spaltenstruktur der BA-Tabellen wechselt
 * je nach Abfrage; deshalb: Kopfzeile selbst finden, Spalten nach Stichwörtern vorschlagen, Admin kann jede Zuordnung
 * ändern. Zahlen im deutschen Format, unterdrückte Werte („*“, „x“, „-“) werden zu leer.
 */

export const STATE_CODES = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"] as const;
export const REGION_CODES = ["DE", "WEST", "OST", ...STATE_CODES] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const REGION_NAMES: Record<RegionCode, string> = {
  DE: "Deutschland",
  WEST: "Westdeutschland",
  OST: "Ostdeutschland",
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");

const REGION_BY_NAME = new Map<string, RegionCode>([
  ...REGION_CODES.map((c) => [norm(REGION_NAMES[c]), c] as [string, RegionCode]),
  ...REGION_CODES.map((c) => [norm(c), c] as [string, RegionCode]),
  ["bund", "DE"],
  ["deutschlandinsgesamt", "DE"],
  ["insgesamt", "DE"],
  ["west", "WEST"],
  ["ost", "OST"],
  ["nrw", "NW"],
  ["badenwuerttemberg", "BW"],
]);

/** Region aus Name oder Kürzel; null, wenn unbekannt (z. B. eine Stadt). */
export function parseRegion(raw: string): RegionCode | null {
  const n = norm(raw.replace(/^\d+\s*/, ""));
  return REGION_BY_NAME.get(n) ?? null;
}

const LEVELS: Record<string, number> = { helfer: 1, fachkraft: 2, spezialist: 3, experte: 4 };

/** Anforderungsniveau aus „Experte“, „4“ oder „4 Experte“; null = alle/unbekannt. */
export function parseLevel(raw: string): number | null {
  const n = norm(raw);
  if (/^[1-4]/.test(n)) return Number(n[0]);
  for (const [k, v] of Object.entries(LEVELS)) if (n.includes(k)) return v;
  return null;
}

/** Deutsche Zahl in ganze Euro: „4.123“, „4.123,50“, „4123“; „*“, „x“, „-“, „.“ und Leeres → null. */
export function parseEuro(raw: string): number | null {
  const s = raw.trim().replace(/€|eur/gi, "").replace(/\s/g, "");
  if (!s || /^[*x.\-–]+$/i.test(s)) return null;
  let n: number;
  if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null;
}

/** KldB-Code (3–5 Ziffern) und Berufsname aus „43104 Berufe in der Informatik …“ oder einer reinen Code-Spalte. */
export function parseOccupation(raw: string): { kldb: string; name: string | null } | null {
  const m = /^\s*(?:B\s*)?(\d{3,5})\b[\s:\-–]*(.*)$/.exec(raw);
  if (!m) return null;
  return { kldb: m[1], name: m[2].trim() || null };
}

/** CSV mit Semikolon, Komma oder Tab; Anführungszeichen wie in Excel-Exporten. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLines = clean.split(/\r?\n/).slice(0, 30).join("\n");
  const count = (c: string) => (firstLines.match(new RegExp(c === "\t" ? "\t" : `\\${c}`, "g")) ?? []).length;
  const delim = [";", "\t", ","].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

export type ColumnMapping = { occupation: number; name: number | null; level: number | null; region: number | null; median: number; q25: number | null; q75: number | null };

/** Kopfzeile: die erste Zeile mit „Median“ (BA-Tabellen haben Titelzeilen davor); sonst die erste Zeile. */
export function findHeaderRow(rows: string[][]): number {
  const i = rows.findIndex((r) => r.some((c) => /median/i.test(c)));
  return i >= 0 ? i : 0;
}

/** Spalten nach Stichwörtern und Inhalt vorschlagen. */
export function guessMapping(rows: string[][], headerRow: number): ColumnMapping {
  const header = rows[headerRow] ?? [];
  const sample = rows.slice(headerRow + 1, headerRow + 30);
  const find = (re: RegExp) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : null;
  };
  const codeColumn = header.findIndex((_, i) => sample.filter((r) => parseOccupation(r[i] ?? "")).length >= Math.max(1, sample.length * 0.6));
  const occupation = find(/kldb|schl(ü|ue)ssel|kennziffer|berufs?code/i) ?? (codeColumn >= 0 ? codeColumn : (find(/beruf/i) ?? 0));
  const name = find(/bezeichnung|berufsbezeichnung|beruf(?!s?code)/i);
  return {
    occupation,
    name: name !== occupation ? name : null,
    level: find(/anforderungsniveau|niveau/i),
    region: find(/region|bundesland|^land$|gebiet/i),
    median: find(/median/i) ?? 1,
    q25: find(/1\.\s*quartil|unteres\s*quartil|25\s*%|p25|q1/i),
    q75: find(/3\.\s*quartil|oberes\s*quartil|75\s*%|p75|q3/i),
  };
}

export type SalaryRecord = { kldb: string; occupationName: string | null; level: number | null; region: RegionCode; median: number; q25: number | null; q75: number | null };
export type ParseResult = { records: SalaryRecord[]; skipped: number; reasons: Record<string, number> };

/**
 * Datenzeilen in Datensätze. Ohne Niveau-Spalte gilt bei 5-stelligem KldB-Code die 5. Stelle (1–4) als
 * Anforderungsniveau; ohne Region-Spalte die Standard-Region des Imports.
 */
export function toRecords(rows: string[][], headerRow: number, m: ColumnMapping, defaultRegion: RegionCode): ParseResult {
  const reasons: Record<string, number> = {};
  const skip = (why: string) => {
    reasons[why] = (reasons[why] ?? 0) + 1;
  };
  const records: SalaryRecord[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(headerRow + 1)) {
    const occ = parseOccupation(r[m.occupation] ?? "");
    if (!occ) {
      skip("kein Berufscode");
      continue;
    }
    const median = parseEuro(r[m.median] ?? "");
    if (median === null) {
      skip("kein Median (leer oder unterdrückt)");
      continue;
    }
    let region: RegionCode | null = defaultRegion;
    if (m.region !== null) {
      region = parseRegion(r[m.region] ?? "");
      if (!region) {
        skip("Region nicht erkannt (z. B. Stadt)");
        continue;
      }
    }
    const level = m.level !== null ? parseLevel(r[m.level] ?? "") : occ.kldb.length === 5 && /[1-4]$/.test(occ.kldb) ? Number(occ.kldb[4]) : null;
    const key = `${occ.kldb}|${level}|${region}`;
    if (seen.has(key)) {
      skip("doppelt");
      continue;
    }
    seen.add(key);
    const name = (m.name !== null ? r[m.name]?.trim() : null) || occ.name;
    records.push({ kldb: occ.kldb, occupationName: name || null, level, region, median, q25: m.q25 !== null ? parseEuro(r[m.q25] ?? "") : null, q75: m.q75 !== null ? parseEuro(r[m.q75] ?? "") : null });
  }
  return { records, skipped: Object.values(reasons).reduce((a, b) => a + b, 0), reasons };
}
