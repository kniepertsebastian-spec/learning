// Sucht in TSX-Dateien nach Rohfarben: Hex-Werte und Tailwind-Standardpaletten. Erlaubt nur in components/ui und app/globals.css.
// Ein Ratschen-Verfahren: der Bestand steht in scripts/ui-token-baseline.json und darf nur sinken, nie steigen.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PALETTES = "red|green|amber|yellow|blue|sky|slate|gray|zinc|neutral|stone|emerald|orange|violet|purple|indigo|teal|cyan|rose|pink|lime|fuchsia";
const UTILITIES = "text|bg|border|ring|from|to|via|fill|stroke|divide|outline|decoration|placeholder|caret|accent|shadow";
const PALETTE_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITIES})-(?:${PALETTES})-\\d{2,3}(?:/\\d+)?(?![\\w-])`, "g");
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g;
// Inline-Texte `de ? "…" : "…"` bzw. mit Template-Literal: gehören nach lib/i18n/components (Sprachcodes wie "de-DE" ausgenommen).
const INLINE_TEXT = /\b(?:de|(?:locale|lang|l) === "de")\s*\?\s*(?:"(?![a-z]{2}(?:-[A-Z]{2})?")|`)/g;

/** Anzahl Verstöße je Art in einem Quelltext. */
export function scanSource(text) {
  // Kommentare ausnehmen
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return { hex: (code.match(HEX) ?? []).length, palette: (code.match(PALETTE_CLASS) ?? []).length, text: (code.match(INLINE_TEXT) ?? []).length };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

export function scanProject(root) {
  const result = {};
  for (const dir of ["app", "components"]) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (rel.startsWith("components/ui/") || rel.startsWith("components/ui-gallery/")) continue;
      const { hex, palette, text } = scanSource(readFileSync(file, "utf8"));
      if (hex + palette + text > 0) result[rel] = { hex, palette, text };
    }
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const baselinePath = path.join(root, "scripts/ui-token-baseline.json");
  const current = scanProject(root);
  if (process.argv.includes("--update")) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
    console.log(`Bestand geschrieben: ${Object.keys(current).length} Dateien.`);
    process.exit(0);
  }
  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    /* kein Bestand */
  }
  const problems = [];
  for (const [file, c] of Object.entries(current)) {
    const b = { hex: 0, palette: 0, text: 0, ...baseline[file] };
    if (c.hex > b.hex || c.palette > b.palette || c.text > b.text) problems.push(`${file}: Hex ${c.hex} (erlaubt ${b.hex}), Palette ${c.palette} (erlaubt ${b.palette}), Inline-Texte ${c.text} (erlaubt ${b.text})`);
  }
  const total = (o) => Object.values(o).reduce((n, c) => n + c.hex + c.palette, 0);
  const texts = (o) => Object.values(o).reduce((n, c) => n + (c.text ?? 0), 0);
  console.log(`Rohfarben im JSX: ${total(current)} (Bestand ${total(baseline)}). Inline-Texte: ${texts(current)} (Bestand ${texts(baseline)}).`);
  if (problems.length) {
    console.error("Neue Rohfarben oder Inline-Texte (Tokens aus app/globals.css und components/ui verwenden, Texte nach lib/i18n/components):\n" + problems.join("\n"));
    process.exit(1);
  }
  if (total(current) + texts(current) < total(baseline) + texts(baseline)) console.log("Bestand ist gesunken: `node scripts/ui-token-scan.mjs --update` hält den neuen Stand fest.");
}
