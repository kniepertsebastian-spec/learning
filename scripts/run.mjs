/**
 * Startet ein Admin-Skript: `node scripts/run.mjs <name> [argumente ...]` führt scripts/<name>.ts aus.
 *
 * - Lokal und in der CI (tsx installiert): direkt die TypeScript-Quelle über tsx, nichts muss vorher gebaut werden.
 * - Im Produktions-Image (nur dependencies, kein tsx): die im builder-Stage kompilierte Fassung dist/scripts/<name>.cjs
 *   (scripts/build-scripts.mjs, PWA-Roadmap AP-04, m-5).
 *
 * So bleibt `docker compose exec app npm run <name> -- ...` gleich, obwohl tsx nicht mehr im Image liegt.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { constants } from "node:os";

const [name, ...args] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error("Usage: node scripts/run.mjs <skript-name> [argumente ...]");
  process.exit(2);
}

let tsxCli = null;
try {
  tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
} catch {
  // kein tsx: Produktions-Image
}

const compiled = `dist/scripts/${name}.cjs`;
const command = tsxCli ? [tsxCli, `scripts/${name}.ts`, ...args] : [compiled, ...args];
if (!tsxCli && !existsSync(compiled)) {
  console.error(`${compiled} fehlt und tsx ist nicht installiert. Im Image baut "npm run build:scripts" die Skripte.`);
  process.exit(1);
}

const child = spawn(process.execPath, command, { stdio: "inherit" });
// Strg+C / docker stop an das Skript weiterreichen, statt es als Waise weiterlaufen zu lassen.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  // Durch ein Signal beendet: Exit-Code wie in der Shell (128 + Signalnummer).
  process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : (code ?? 1));
});
