// Kontrast aller Text-/Hintergrundpaare der Designsprache (WCAG 2.x), gelesen aus app/globals.css.
// Aufruf: node scripts/check-contrast.mjs [--write]   (--write schreibt docs/UI-KONTRAST.md)
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/@(import|plugin|custom-variant)[^;]*;/g, "");

function blocks() {
  const out = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    const vars = {};
    for (const v of m[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
    if (Object.keys(vars).length) out.push({ selector, vars });
  }
  return out;
}
const all = blocks();
const find = (...needles) => Object.assign({}, ...all.filter((b) => needles.some((n) => b.selector === n)).map((b) => b.vars));

const themes = {
  hell: find(":root, .light"),
  dunkel: find(".dark"),
};
const contexts = {
  persönlich: { hell: find(":root, .light"), dunkel: find(".dark") },
  firma: { hell: find(':root[data-context="company"], .light[data-context="company"], [data-context="company"] .light'), dunkel: find('.dark[data-context="company"], [data-context="company"] .dark') },
  admin: { hell: find(':root[data-context="admin"], .light[data-context="admin"], [data-context="admin"] .light'), dunkel: find('.dark[data-context="admin"], [data-context="admin"] .dark') },
};

function resolve(vars, base, name, depth = 0) {
  let v = vars[name] ?? base[name];
  if (v === undefined) throw new Error(`Token ${name} fehlt`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref && depth < 5) return resolve(vars, base, ref[1], depth + 1);
  return v;
}
function rgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}
function lum([r, g, b]) {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [Vordergrund, Hintergrund, Mindestwert, Beschreibung]
const PAIRS = [
  ["--text", "--bg", 4.5], ["--text", "--surface", 4.5], ["--text", "--surface-2", 4.5],
  ["--text-2", "--bg", 4.5], ["--text-2", "--surface", 4.5], ["--text-2", "--surface-2", 4.5],
  ["--text-muted", "--bg", 4.5], ["--text-muted", "--surface", 4.5], ["--text-muted", "--surface-2", 4.5],
  ["--text-subtle", "--bg", 4.5], ["--text-subtle", "--surface", 4.5], ["--text-subtle", "--surface-2", 4.5],
  ["--text-faint", "--bg", 4.5], ["--text-faint", "--surface", 4.5], ["--text-faint", "--surface-2", 4.5],
  ["--accent-text", "--bg", 4.5], ["--accent-text", "--surface", 4.5],
  ["--on-accent", "--accent", 4.5],
  ["--info-text", "--surface", 4.5], ["--warning-text", "--surface", 4.5], ["--danger-text", "--surface", 4.5], ["--violet", "--surface", 3],
];
const CTX_PAIRS = [["--ctx-link", "--bg", 4.5], ["--ctx-link", "--surface", 4.5], ["--ctx-on-accent", "--ctx-accent", 4.5], ["--ctx-label", "--ctx-sidebar", 4.5]];

const rows = [];
let failed = 0;
function check(label, fg, bg, min, f, b) {
  const r = ratio(f, b);
  const ok = r >= min;
  if (!ok) failed++;
  rows.push(`| ${label} | \`${f}\` | \`${b}\` | ${r.toFixed(2)} | ${min} | ${ok ? "ok" : "**zu niedrig**"} |`);
}
for (const [theme, vars] of Object.entries(themes)) {
  for (const [fg, bg, min] of PAIRS) {
    const bgVal = resolve(vars, vars, bg);
    // halbtransparente Flächen werden hier nicht geprüft (nur die vollen Töne)
    check(`${theme}: ${fg} auf ${bg}`, fg, bg, min, resolve(vars, vars, fg), bgVal);
  }
}
for (const [ctx, byTheme] of Object.entries(contexts)) {
  for (const [theme, vars] of Object.entries(byTheme)) {
    const base = themes[theme];
    for (const [fg, bg, min] of CTX_PAIRS) {
      check(`${theme}, Kontext ${ctx}: ${fg} auf ${bg}`, fg, bg, min, resolve(vars, { ...base, ...vars }, fg), resolve(vars, { ...base, ...vars }, bg));
    }
  }
}

const md = `# UI: Kontrastmessung\n\nErzeugt von \`node scripts/check-contrast.mjs --write\` aus \`app/globals.css\` (WCAG 2.x; Text ≥ 4.5:1, ab 24 px ≥ 3:1). ${failed === 0 ? "Alle Paare bestehen." : `**${failed} Paare bestehen nicht.**`}\n\n| Paar | Vordergrund | Hintergrund | Verhältnis | Soll | Ergebnis |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
if (process.argv.includes("--write")) writeFileSync(new URL("../docs/UI-KONTRAST.md", import.meta.url), md);
console.log(`${rows.length} Paare geprüft, ${failed} unter dem Sollwert.`);
if (failed) {
  console.log(rows.filter((r) => r.includes("zu niedrig")).join("\n"));
  process.exit(1);
}
