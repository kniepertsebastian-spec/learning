/**
 * Kompiliert die Admin-Skripte (scripts/*.ts) für das Produktions-Image nach dist/scripts/*.cjs (PWA-Roadmap AP-04, m-5).
 *
 * Im Container läuft weder tsx noch drizzle-kit: beide sind reine Entwicklungswerkzeuge (devDependencies). Der builder-Stage
 * im Dockerfile ruft dieses Skript auf; scripts/run.mjs startet dann die kompilierte Fassung. Lokal und in der CI laufen die
 * .ts-Dateien weiter direkt über tsx (nichts muss vorher gebaut werden).
 *
 * Gebündelt wird nur der eigene Code (lib/, scripts/, Pfad-Alias "@/"); Pakete aus node_modules bleiben Imports und kommen
 * zur Laufzeit aus den Produktions-Abhängigkeiten. Importiert ein Skript ein Paket, das nur in devDependencies steht, bricht
 * der Build hier ab, statt erst beim Aufruf im Container.
 *
 * Usage: npm run build:scripts
 */
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { build } from "esbuild";

const OUT_DIR = "dist/scripts";
const entryPoints = readdirSync("scripts")
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `scripts/${f}`);

rmSync(OUT_DIR, { recursive: true, force: true });
const result = await build({
  entryPoints,
  outdir: OUT_DIR,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  // CommonJS wie bei tsx (package.json hat kein "type": "module"): gleiche Interop mit Paketen wie web-push
  // (`import x from` = module.exports) und gleiche Reihenfolge, in der dotenv und die Module laufen.
  format: "cjs",
  target: "node26",
  packages: "external",
  metafile: true,
  logLevel: "warning",
});

// Jeder Paket-Import der kompilierten Skripte muss in "dependencies" stehen, sonst fehlt er im Image (npm ci --omit=dev).
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const runtime = new Set(Object.keys(pkg.dependencies ?? {}));
const builtins = new Set(builtinModules);
const packageName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
const missing = new Map();
for (const [file, output] of Object.entries(result.metafile.outputs)) {
  for (const imp of output.imports) {
    if (!imp.external || imp.path.startsWith("node:") || builtins.has(imp.path)) continue;
    const name = packageName(imp.path);
    if (runtime.has(name)) continue;
    missing.set(name, [...(missing.get(name) ?? []), file]);
  }
}
if (missing.size > 0) {
  for (const [name, files] of missing) console.error(`${name} ist keine Laufzeit-Abhängigkeit, wird aber importiert von: ${[...new Set(files)].join(", ")}`);
  process.exit(1);
}
console.log(`${entryPoints.length} Skripte nach ${OUT_DIR} kompiliert.`);
