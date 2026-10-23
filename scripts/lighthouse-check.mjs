/**
 * Lighthouse-Check (Best Practices) gegen einen laufenden Server. Warnschwelle, kein harter Fehler: Unterschreitet ein Wert
 * die Schwelle, gibt das Skript eine Warnung aus (GitHub Actions: ::warning::), beendet sich aber mit Exit-Code 0.
 * Exit-Code 1 nur, wenn Lighthouse selbst nicht lief.
 *
 * Usage: npm run lighthouse -- [url] [schwelle 0-1]   (Standard: http://localhost:3100/login, 0.9)
 * Chrome: CHROME_PATH (sonst findet Lighthouse ein installiertes Chrome/Chromium).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:3100/login";
const threshold = Number(process.argv[3] ?? 0.9);
const out = join(mkdtempSync(join(tmpdir(), "lighthouse-")), "report.json");

try {
  execFileSync(
    "npx",
    ["--yes", "lighthouse@12.8.2", url, "--only-categories=best-practices", "--output=json", `--output-path=${out}`, "--quiet", "--chrome-flags=--headless --no-sandbox --disable-gpu"],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
} catch (error) {
  console.error("Lighthouse konnte nicht ausgeführt werden:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const report = JSON.parse(readFileSync(out, "utf8"));
const score = report.categories?.["best-practices"]?.score;
console.log(`Lighthouse Best Practices (${url}): ${score === null || score === undefined ? "keine Punktzahl" : Math.round(score * 100)}`);
for (const audit of Object.values(report.audits)) {
  if (audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== "informative" && audit.scoreDisplayMode !== "manual") {
    console.log(`  - ${audit.title} (${audit.id}): ${audit.score}`);
  }
}
if (typeof score === "number" && score < threshold) {
  const message = `Lighthouse Best Practices ${Math.round(score * 100)} liegt unter der Schwelle ${Math.round(threshold * 100)}.`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `WARNUNG: ${message}`);
}
