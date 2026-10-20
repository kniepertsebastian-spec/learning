import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { salaryDatasets, salaryStats, users } from "@/lib/server/db/schema";
import { parseCsv, REGION_CODES, toRecords, type RegionCode } from "@/lib/salary/parse";

/**
 * Gehaltsstatistik (roadmap3.md, Schritt 9): Import einer CSV-Tabelle der Entgeltstatistik der Bundesagentur für Arbeit
 * und Abfrage je Beruf (KldB 2010). Angezeigt wird immer der neueste Datensatz, mit Quelle und Stichtag. Werte kommen
 * nur aus der Tabelle, nie aus der KI.
 */

export const DEFAULT_SOURCE = "Statistik der Bundesagentur für Arbeit, Entgeltstatistik";

const col = z.number().int().min(0).max(200);
export const importSchema = z.object({
  csv: z.string().min(1).max(30_000_000),
  fileName: z.string().max(200).nullable(),
  headerRow: z.number().int().min(0),
  mapping: z.object({ occupation: col, name: col.nullable(), level: col.nullable(), region: col.nullable(), median: col, q25: col.nullable(), q75: col.nullable() }),
  defaultRegion: z.enum(REGION_CODES),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().trim().min(3).max(300),
});
export type ImportInput = z.infer<typeof importSchema>;

export class SalaryImportError extends Error {}

export async function importSalaryDataset(input: ImportInput, userId: string | null) {
  const p = importSchema.parse(input);
  const rows = parseCsv(p.csv);
  const result = toRecords(rows, p.headerRow, p.mapping, p.defaultRegion as RegionCode);
  if (result.records.length === 0) throw new SalaryImportError("Keine verwertbaren Zeilen gefunden. Bitte die Spaltenzuordnung prüfen.");
  const datasetId = await getDb().transaction(async (tx) => {
    const [ds] = await tx
      .insert(salaryDatasets)
      .values({ source: p.source, referenceDate: p.referenceDate, fileName: p.fileName, rowCount: result.records.length, importedByUserId: userId })
      .returning({ id: salaryDatasets.id });
    for (let i = 0; i < result.records.length; i += 1000) {
      await tx.insert(salaryStats).values(result.records.slice(i, i + 1000).map((r) => ({ ...r, datasetId: ds.id })));
    }
    return ds.id;
  });
  return { datasetId, imported: result.records.length, skipped: result.skipped, reasons: result.reasons };
}

export async function listSalaryDatasets() {
  return getDb()
    .select({ id: salaryDatasets.id, source: salaryDatasets.source, referenceDate: salaryDatasets.referenceDate, fileName: salaryDatasets.fileName, rowCount: salaryDatasets.rowCount, importedAt: salaryDatasets.importedAt, importedBy: users.email })
    .from(salaryDatasets)
    .leftJoin(users, eq(users.id, salaryDatasets.importedByUserId))
    .orderBy(desc(salaryDatasets.referenceDate), desc(salaryDatasets.importedAt));
}

export async function deleteSalaryDataset(id: string): Promise<boolean> {
  const rows = await getDb().delete(salaryDatasets).where(eq(salaryDatasets.id, id)).returning({ id: salaryDatasets.id });
  return rows.length > 0;
}

/** Neuester Datensatz (jüngster Stichtag, bei gleichem der zuletzt importierte). */
export async function currentDataset() {
  const [ds] = await getDb().select().from(salaryDatasets).orderBy(desc(salaryDatasets.referenceDate), desc(salaryDatasets.importedAt)).limit(1);
  return ds ?? null;
}

export type SalaryInfo = {
  kldb: string;
  occupationName: string | null;
  level: number | null;
  /** true, wenn nicht der genaue Code, sondern eine übergeordnete Berufsgruppe getroffen wurde. */
  approximate: boolean;
  regions: Array<{ region: RegionCode; median: number; q25: number | null; q75: number | null }>;
  source: string;
  referenceDate: string;
};

/**
 * Gehalt für einen Beruf: erst der genaue KldB-Code, sonst die übergeordneten Gruppen (4, dann 3 Stellen); je Code mit
 * passendem Anforderungsniveau, sonst „alle Niveaus“. null, wenn es keinen Datensatz oder keinen Treffer gibt.
 */
export async function salaryFor(kldb: string, level: number | null): Promise<SalaryInfo | null> {
  if (!/^\d{3,5}$/.test(kldb)) return null;
  const ds = await currentDataset();
  if (!ds) return null;
  const candidates = [kldb, kldb.slice(0, 4), kldb.slice(0, 3)].filter((c, i, a) => c.length >= 3 && a.indexOf(c) === i);
  const rows = await getDb()
    .select()
    .from(salaryStats)
    .where(and(eq(salaryStats.datasetId, ds.id), inArray(salaryStats.kldb, candidates)));
  for (const code of candidates) {
    const forCode = rows.filter((r) => r.kldb === code);
    if (!forCode.length) continue;
    const withLevel = level !== null ? forCode.filter((r) => r.level === level) : [];
    const pick = withLevel.length ? withLevel : forCode.filter((r) => r.level === null).length ? forCode.filter((r) => r.level === null) : forCode;
    const lvl = pick[0].level;
    const regions = pick
      .filter((r) => r.level === lvl)
      .map((r) => ({ region: r.region as RegionCode, median: r.median, q25: r.q25, q75: r.q75 }))
      .sort((a, b) => REGION_CODES.indexOf(a.region) - REGION_CODES.indexOf(b.region));
    return { kldb: code, occupationName: pick.find((r) => r.occupationName)?.occupationName ?? null, level: lvl, approximate: code !== kldb, regions, source: ds.source, referenceDate: ds.referenceDate };
  }
  return null;
}

/** Berufe im aktuellen Datensatz, deren Name einen der Suchbegriffe enthält (Hilfe für die KI bei der Code-Wahl). */
export async function occupationsMatching(terms: string[], limit = 60): Promise<Array<{ kldb: string; name: string }>> {
  const ds = await currentDataset();
  const words = terms.map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 12);
  if (!ds || !words.length) return [];
  const rows = await getDb()
    .selectDistinct({ kldb: salaryStats.kldb, name: salaryStats.occupationName })
    .from(salaryStats)
    .where(and(eq(salaryStats.datasetId, ds.id), sql`(${sql.join(words.map((w) => sql`${salaryStats.occupationName} ilike ${"%" + w + "%"}`), sql` or `)})`))
    .limit(limit);
  return rows.filter((r): r is { kldb: string; name: string } => Boolean(r.name));
}

