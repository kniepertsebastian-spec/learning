/**
 * Vergleichsgrafik „Eine Woche Pause“ (roadmap_motivation Phase 1): schreibt JSON (mit allen Annahmen) und eine statische SVG-Grafik.
 * Rein synthetisch, keine Datenbank, keine Nutzerdaten, reproduzierbar (fester Seed).
 *
 * Usage: npm run psrp:pause-demo -- [--out docs/pause-demo] [--pause-days 7] [--budget 15] [--seconds 15] [--seed 1]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderPauseSvg } from "../lib/server/psrp/pause-chart";
import { simulatePause, type PauseParams } from "../lib/server/psrp/pause-scenario";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string): number | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`--${name} muss eine positive Zahl sein.`);
    process.exit(1);
  }
  return n;
};

const overrides: Partial<PauseParams> = {};
const pauseDays = num("pause-days");
if (pauseDays !== undefined) overrides.pauseDays = pauseDays;
const budget = num("budget");
if (budget !== undefined) overrides.timeBudgetMin = budget;
const seconds = num("seconds");
if (seconds !== undefined) overrides.secondsPerReview = seconds;
const seed = num("seed");
if (seed !== undefined) overrides.seed = seed;

const out = path.resolve(arg("out") ?? "docs/pause-demo");
const scenario = simulatePause(overrides);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "pause-demo.json"), `${JSON.stringify(scenario, null, 2)}\n`);
writeFileSync(path.join(out, "pause-demo.de.svg"), renderPauseSvg(scenario, "de"));
writeFileSync(path.join(out, "pause-demo.en.svg"), renderPauseSvg(scenario, "en"));

const a = scenario.assumptions;
console.log(`Annahmen: ${a.totalCards} Karten, ${a.newCardsPerDay} neue/Tag, ${a.timeBudgetMin} min Budget (${a.dailyCardLimit} Karten), ${a.secondsPerReview} s/Karte, ${a.leadInDays} Tage Vorlauf, ${a.pauseDays} Tage Pause, r_ziel ${a.rTarget}, Seed ${a.seed}`);
for (const mode of ["vanilla", "planning"] as const) {
  const m = scenario.metrics[mode];
  console.log(
    `${mode.padEnd(8)} Tag 1 nach der Pause: ${m.dueFirstDayAfterPause} fällig, ${m.peakCardsFirstDayAfterPause} bearbeitet, ${m.peakMinutesFirstDayAfterPause} min` +
      ` | Rückstand weg nach: ${m.daysToClearBacklog === null ? "nicht im Zeitraum" : `${m.daysToClearBacklog} Tag(en)`}` +
      ` | Behaltensquote 30 Tage: ${m.retention30DaysAfterPause === null ? "-" : `${Math.round(m.retention30DaysAfterPause * 100)} %`}`,
  );
}
console.log(`Geschrieben: ${path.relative(process.cwd(), out)}/pause-demo.json, pause-demo.de.svg, pause-demo.en.svg`);
