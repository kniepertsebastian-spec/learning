/**
 * Lighthouse-Check (Performance, Barrierefreiheit, Best Practices) gegen einen laufenden Server, standardmäßig für /login
 * und /offline.
 *
 * - Barrierefreiheit ist eine harte Grenze: Liegt eine Seite darunter, endet das Skript mit Exit-Code 1 (CI wird rot).
 * - Performance und Best Practices sind Warnschwellen (GitHub Actions: ::warning::), weil die Messwerte auf geteilten
 *   CI-Rechnern schwanken; sie brechen nichts ab.
 * - Exit-Code 1 auch, wenn Lighthouse selbst nicht lief oder keine Punktzahl lieferte: nichts wird stumm übersprungen.
 *
 * Usage: npm run lighthouse -- [basis-url] [pfad ...]   (Standard: http://localhost:3100, /login /offline)
 * Schwellen (0-1): LIGHTHOUSE_MIN_ACCESSIBILITY (Standard 0.9, hart), LIGHTHOUSE_WARN_PERFORMANCE (0.5),
 *                  LIGHTHOUSE_MIN_PERFORMANCE (ungesetzt; gesetzt = harte Grenze statt Warnung),
 *                  LIGHTHOUSE_WARN_BEST_PRACTICES (0.9).
 * Chrome: CHROME_PATH (sonst findet Lighthouse ein installiertes Chrome/Chromium).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const paths = process.argv.length > 3 ? process.argv.slice(3) : ["/login", "/offline"];

function threshold(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    console.error(`${name}=${raw} ist keine Schwelle zwischen 0 und 1.`);
    process.exit(1);
  }
  return value;
}

/**
 * kind "error" bricht ab, "warning" meldet nur. Performance wird zur harten Grenze, sobald LIGHTHOUSE_MIN_PERFORMANCE gesetzt
 * ist (PWA-Roadmap AP-04, m-4: erst wenn die Werte in der CI stabil darüber liegen); die Warnschwelle gilt dann nicht mehr.
 */
const minPerformance = threshold("LIGHTHOUSE_MIN_PERFORMANCE", null);
const CATEGORIES = [
  minPerformance === null
    ? { id: "performance", label: "Performance", min: threshold("LIGHTHOUSE_WARN_PERFORMANCE", 0.5), kind: "warning" }
    : { id: "performance", label: "Performance", min: minPerformance, kind: "error" },
  { id: "accessibility", label: "Barrierefreiheit", min: threshold("LIGHTHOUSE_MIN_ACCESSIBILITY", 0.9), kind: "error" },
  { id: "best-practices", label: "Best Practices", min: threshold("LIGHTHOUSE_WARN_BEST_PRACTICES", 0.9), kind: "warning" },
];

const pct = (score) => Math.round(score * 100);
const annotate = (kind, message) => console.log(process.env.GITHUB_ACTIONS ? `::${kind}::${message}` : `${kind === "error" ? "FEHLER" : "WARNUNG"}: ${message}`);

let failed = false;
const dir = mkdtempSync(join(tmpdir(), "lighthouse-"));

for (const [index, path] of paths.entries()) {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const out = join(dir, `report-${index}.json`);
  try {
    execFileSync(
      "npx",
      [
        "--yes",
        "lighthouse@12.8.2",
        url,
        `--only-categories=${CATEGORIES.map((c) => c.id).join(",")}`,
        "--output=json",
        `--output-path=${out}`,
        "--quiet",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
      ],
      { stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" },
    );
  } catch (error) {
    annotate("error", `Lighthouse konnte für ${url} nicht ausgeführt werden: ${error instanceof Error ? error.message : error}`);
    failed = true;
    continue;
  }

  const report = JSON.parse(readFileSync(out, "utf8"));
  console.log(`\nLighthouse ${url}`);
  for (const category of CATEGORIES) {
    const score = report.categories?.[category.id]?.score;
    if (typeof score !== "number") {
      annotate("error", `${category.label} (${url}): keine Punktzahl.`);
      failed = true;
      continue;
    }
    const kindLabel = category.kind === "error" ? "Mindestwert" : "Warnschwelle";
    console.log(`  ${category.label}: ${pct(score)} (${kindLabel} ${pct(category.min)})`);
    if (score < category.min) {
      annotate(category.kind, `${category.label} auf ${path}: ${pct(score)} liegt unter der ${kindLabel} ${pct(category.min)}.`);
      if (category.kind === "error") failed = true;
    }
    // Die Audits hinter einem Abzug, damit ein roter Lauf ohne den Bericht nachvollziehbar ist.
    for (const ref of report.categories[category.id].auditRefs ?? []) {
      const audit = report.audits[ref.id];
      if (!audit || ref.weight === 0) continue;
      if (audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== "informative" && audit.scoreDisplayMode !== "manual") {
        console.log(`    - ${audit.title} (${audit.id}): ${audit.score}`);
      }
    }
  }
}

process.exit(failed ? 1 : 0);
