"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { findHeaderRow, guessMapping, parseCsv, REGION_CODES, REGION_NAMES, toRecords, type ColumnMapping, type RegionCode } from "@/lib/salary/parse";

type Dataset = { id: string; source: string; referenceDate: string; fileName: string | null; rowCount: number; importedAt: string; importedBy: string | null };
const field = "h-9 w-full rounded-md border border-border-strong bg-control px-2 text-sm";

/**
 * Import der Entgeltstatistik der Bundesagentur für Arbeit (CSV): Datei wählen → Vorschau mit vorgeschlagener
 * Spaltenzuordnung → bestätigen. Die Tabellen der BA sind je Abfrage unterschiedlich aufgebaut, deshalb lässt sich jede
 * Zuordnung ändern, und die Vorschau zeigt, was daraus würde, bevor etwas gespeichert wird.
 */
export function SalaryImport({ locale, datasets }: { locale: "de" | "en"; datasets: Dataset[] }) {
  const de = locale === "de";
  const tr = (d: string, e: string) => (de ? d : e);
  const router = useRouter();
  const [csv, setCsv] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headerRow, setHeaderRow] = React.useState(0);
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null);
  const [defaultRegion, setDefaultRegion] = React.useState<RegionCode>("DE");
  const [referenceDate, setReferenceDate] = React.useState(`${new Date().getFullYear() - 1}-12-31`);
  const [source, setSource] = React.useState("Statistik der Bundesagentur für Arbeit, Entgeltstatistik");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const rows = React.useMemo(() => (csv ? parseCsv(csv) : []), [csv]);
  const header = rows[headerRow] ?? [];
  const preview = React.useMemo(() => (mapping ? toRecords(rows, headerRow, mapping, defaultRegion) : null), [rows, headerRow, mapping, defaultRegion]);

  async function onFile(file: File | undefined) {
    setMsg(null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    const h = findHeaderRow(parsed);
    setCsv(text);
    setFileName(file.name);
    setHeaderRow(h);
    setMapping(guessMapping(parsed, h));
  }
  const setCol = (key: keyof ColumnMapping, value: string) => setMapping((m) => (m ? { ...m, [key]: value === "" ? null : Number(value) } : m));

  async function submit() {
    if (!csv || !mapping) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/salary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, fileName, headerRow, mapping, defaultRegion, referenceDate, source }) });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? tr("Import fehlgeschlagen.", "Import failed.") });
    setMsg({ ok: true, text: tr(`${json.imported} Zeilen importiert, ${json.skipped} übersprungen.`, `${json.imported} rows imported, ${json.skipped} skipped.`) });
    setCsv(null);
    setMapping(null);
    router.refresh();
  }
  async function remove(d: Dataset) {
    if (!window.confirm(tr(`Datensatz „${d.source}“ (Stichtag ${d.referenceDate}) löschen?`, `Delete dataset “${d.source}” (reference date ${d.referenceDate})?`))) return;
    const res = await fetch(`/api/admin/salary/${d.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  const colSelect = (key: keyof ColumnMapping, label: string, optional: boolean) => (
    <label className="block text-sm" key={key}>
      <span className="mb-1 block font-medium">{label}</span>
      <select className={field} value={mapping?.[key] ?? ""} onChange={(e) => setCol(key, e.target.value)} data-testid={`map-${key}`}>
        {optional && <option value="">{tr("– nicht vorhanden –", "– none –")}</option>}
        {header.map((h, i) => (
          <option key={i} value={i}>{`${i + 1}: ${h || tr("(leer)", "(empty)")}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <h2 className="text-lg font-semibold">{tr("Neue Tabelle importieren", "Import a new table")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          {tr(
            "CSV aus der Entgeltstatistik der Bundesagentur für Arbeit: Bruttomonatsentgelt je Beruf (KldB 2010), möglichst mit Anforderungsniveau und Bundesland, Median und Quartilen. Einmal im Jahr aktualisieren; angezeigt wird immer der neueste Datensatz mit Quelle und Stichtag.",
            "CSV from the Federal Employment Agency's earnings statistics: gross monthly earnings by occupation (KldB 2010), ideally with skill level and state, median and quartiles. Update once a year; the newest dataset is always shown with source and reference date.",
          )}
        </p>
        <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-control px-3 py-2 text-sm font-medium hover:bg-surface-2">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {tr("CSV-Datei wählen", "Choose CSV file")}
          <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="salary-file" />
        </label>

        {csv && mapping && (
          <div className="mt-5 flex flex-col gap-4" data-testid="salary-preview">
            <p className="text-sm text-subtle">{fileName} · {rows.length} {tr("Zeilen", "rows")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Kopfzeile (Zeile)", "Header row")}</span>
                <input type="number" min={1} max={Math.max(1, rows.length)} className={field} value={headerRow + 1} onChange={(e) => { const h = Math.max(0, Number(e.target.value) - 1); setHeaderRow(h); setMapping(guessMapping(rows, h)); }} />
              </label>
              {colSelect("occupation", tr("Beruf / KldB-Code", "Occupation / KldB code"), false)}
              {colSelect("name", tr("Berufsbezeichnung", "Occupation name"), true)}
              {colSelect("level", tr("Anforderungsniveau", "Skill level"), true)}
              {colSelect("region", tr("Region / Bundesland", "Region / state"), true)}
              {colSelect("median", tr("Median", "Median"), false)}
              {colSelect("q25", tr("Unteres Quartil (25 %)", "Lower quartile (25%)"), true)}
              {colSelect("q75", tr("Oberes Quartil (75 %)", "Upper quartile (75%)"), true)}
            </div>
            {mapping.region === null && (
              <label className="block max-w-xs text-sm">
                <span className="mb-1 block font-medium">{tr("Region der ganzen Tabelle", "Region of the whole table")}</span>
                <select className={field} value={defaultRegion} onChange={(e) => setDefaultRegion(e.target.value as RegionCode)}>
                  {REGION_CODES.map((c) => (
                    <option key={c} value={c}>{REGION_NAMES[c]}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Stichtag der Statistik", "Reference date")}</span>
                <input type="date" className={field} value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Quellenangabe", "Source note")}</span>
                <input className={field} value={source} onChange={(e) => setSource(e.target.value)} maxLength={300} />
              </label>
            </div>

            {preview && (
              <div className="rounded-xl border border-border bg-surface-inset p-3 text-sm">
                <p className="font-medium">
                  {tr(`${preview.records.length} Zeilen würden importiert, ${preview.skipped} übersprungen.`, `${preview.records.length} rows would be imported, ${preview.skipped} skipped.`)}
                </p>
                {Object.entries(preview.reasons).length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-subtle">
                    {Object.entries(preview.reasons).map(([why, n]) => (
                      <li key={why}>{n}× {why}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface text-subtle">
                        <th className="px-2 py-1">KldB</th>
                        <th className="px-2 py-1">{tr("Beruf", "Occupation")}</th>
                        <th className="px-2 py-1">{tr("Niveau", "Level")}</th>
                        <th className="px-2 py-1">{tr("Region", "Region")}</th>
                        <th className="px-2 py-1 text-right">Median</th>
                        <th className="px-2 py-1 text-right">25 %</th>
                        <th className="px-2 py-1 text-right">75 %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.records.slice(0, 12).map((r, i) => (
                        <tr key={i} className="border-t border-border-subtle">
                          <td className="px-2 py-1 font-mono">{r.kldb}</td>
                          <td className="px-2 py-1">{r.occupationName ?? "–"}</td>
                          <td className="px-2 py-1">{r.level ?? "–"}</td>
                          <td className="px-2 py-1">{r.region}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{r.median}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{r.q25 ?? "–"}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{r.q75 ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div>
              <Button onClick={() => void submit()} disabled={busy || !preview || preview.records.length === 0} data-testid="salary-import">
                {tr("Importieren", "Import")}
              </Button>
            </div>
          </div>
        )}
        {msg && <p role="status" className={msg.ok ? "mt-3 text-sm text-mint-text" : "mt-3 text-sm text-danger-text"}>{msg.text}</p>}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm" data-testid="salary-datasets">
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="px-4 py-2">{tr("Stichtag", "Reference date")}</th>
              <th className="px-4 py-2">{tr("Quelle", "Source")}</th>
              <th className="px-4 py-2 text-right">{tr("Zeilen", "Rows")}</th>
              <th className="px-4 py-2">{tr("Importiert", "Imported")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-subtle">{tr("Noch keine Gehaltsdaten. Ohne sie zeigen die Karrierepfade kein Gehalt.", "No salary data yet. Without it, career paths show no salary.")}</td>
              </tr>
            )}
            {datasets.map((d, i) => (
              <tr key={d.id} className="border-t border-border-subtle">
                <td className="px-4 py-2 font-medium">{d.referenceDate}{i === 0 && <span className="ml-2 rounded-full bg-mint-soft px-2 py-0.5 text-xs text-mint-text">{tr("aktuell", "current")}</span>}</td>
                <td className="px-4 py-2">{d.source}</td>
                <td className="px-4 py-2 text-right tabular-nums">{d.rowCount}</td>
                <td className="px-4 py-2 text-xs text-subtle">{new Date(d.importedAt).toLocaleDateString(de ? "de-DE" : "en-GB")}{d.importedBy ? ` · ${d.importedBy}` : ""}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="rounded p-1.5 text-subtle hover:bg-surface-2 hover:text-danger-text" onClick={() => void remove(d)} aria-label={tr("Löschen", "Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
