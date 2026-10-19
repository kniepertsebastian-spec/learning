import { parseSimulation, SIMULATION_LANG } from "./simulation";

/**
 * Qualitätsprüfung der Lernblöcke in generiertem Lernstoff (docs/ROADMAP-UI.md U5): Direktiven müssen geschlossen sein,
 * `:::practice` braucht alle vier Teile, `:::tabs` mindestens zwei `::tab[…]`, Hinweise nur mit bekannten Markern, Codeblöcke
 * geschlossen, ```simulation enthält eine gültige Simulation (lib/markdown/simulation.ts). Fehlende Blöcke sind kein Fehler (der Prompt verlangt sie, die Quelle entscheidet). Liefert Fehlertexte.
 */
const KNOWN_DIRECTIVES = new Set(["tabs", "steps", "practice"]);
const KNOWN_CALLOUTS = new Set(["EXAM", "MISTAKE", "MEMO", "NOTE"]);
const PRACTICE_HEADINGS: Record<string, string> = { szenario: "scenario", scenario: "scenario", aufgabe: "task", task: "task", lösung: "solution", loesung: "solution", solution: "solution", warum: "why", why: "why" };

/** Ein Schritt in `:::steps`: Aufzählungs- oder nummerierter Listenpunkt (der Renderer nimmt beide Listenarten an). */
const STEP_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

type Fence = { char: string; len: number; line: number; sim: boolean; body: string[] };
const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([\w-]*)/;
const isSimLang = (lang: string | undefined) => (lang ?? "").toLowerCase() === SIMULATION_LANG;

type Open = { name: string; colons: number; line: number; headings: Set<string>; tabs: number; items: number };

export function validateLearningBlocks(markdown: string): string[] {
  const errors: string[] = [];
  const stack: Open[] = [];
  let fence: Fence | null = null;
  const lines = markdown.split("\n");

  lines.forEach((raw, i) => {
    const line = raw;
    const n = i + 1;
    const f = FENCE_OPEN.exec(line);
    if (f && !fence) {
      fence = { char: f[1][0], len: f[1].length, line: n, sim: isSimLang(f[2]), body: [] };
      return;
    }
    if (fence) {
      if (f && f[1][0] === fence.char && f[1].length >= fence.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) {
        if (fence.sim) {
          const r = parseSimulation(fence.body.join("\n"));
          if (!r.ok) errors.push(`Simulation ab Zeile ${fence.line} ungültig: ${r.errors.join("; ")}.`);
        }
        fence = null;
      } else fence.body.push(line);
      return;
    }

    const d = /^(:{3,})\s*([A-Za-z][\w-]*)?/.exec(line);
    if (d && !/^::[^:]/.test(line)) {
      const colons = d[1].length;
      const name = d[2];
      if (name) {
        if (!KNOWN_DIRECTIVES.has(name)) errors.push(`Zeile ${n}: unbekannter Block ":::${name}".`);
        stack.push({ name, colons, line: n, headings: new Set(), tabs: 0, items: 0 });
      } else {
        const top = stack.pop();
        if (!top) errors.push(`Zeile ${n}: ":::" ohne öffnenden Block.`);
        else finish(top, errors);
      }
      return;
    }
    const top = stack[stack.length - 1];
    if (top) {
      if (/^::tab\[/.test(line)) top.tabs++;
      const h = /^#{3}\s+(.+?)\s*$/.exec(line);
      if (h) top.headings.add(PRACTICE_HEADINGS[h[1].toLowerCase().replace(/[:.]/g, "")] ?? "?");
      if (top.name === "steps" && STEP_ITEM.test(line)) top.items++;
    }
    const c = /^\s*>\s*\[!([A-Za-z]+)\]/.exec(line);
    if (c && !KNOWN_CALLOUTS.has(c[1].toUpperCase())) errors.push(`Zeile ${n}: unbekannter Hinweis "[!${c[1]}]" (erlaubt: EXAM, MISTAKE, MEMO, NOTE).`);
  });

  const unclosedFence = fence as { line: number } | null;
  if (unclosedFence) errors.push(`Codeblock ab Zeile ${unclosedFence.line} nicht geschlossen.`);
  for (const open of stack) errors.push(`Block ":::${open.name}" ab Zeile ${open.line} nicht geschlossen.`);
  return errors;
}

function finish(block: Open, errors: string[]) {
  if (block.name === "practice") {
    const missing = ["scenario", "task", "solution", "why"].filter((p) => !block.headings.has(p));
    if (missing.length) errors.push(`:::practice ab Zeile ${block.line}: es fehlen Teile (${missing.join(", ")}); nötig sind Szenario, Aufgabe, Lösung, Warum.`);
  }
  if (block.name === "tabs" && block.tabs < 2) errors.push(`:::tabs ab Zeile ${block.line}: mindestens zwei ::tab[…] nötig.`);
  if (block.name === "steps" && block.items < 2) errors.push(`:::steps ab Zeile ${block.line}: mindestens zwei Schritte nötig.`);
}

/**
 * Repariert, was sich an Lernblöcken ohne KI reparieren lässt, statt ein ganzes Lernziel neu erzeugen zu lassen:
 * - ein ungültiger Block (`:::steps` mit weniger als zwei Schritten, `:::tabs` mit weniger als zwei Tabs, `:::practice`
 *   ohne alle vier Teile, unbekannter Blockname) wird aufgelöst: Öffnungs- und Schlusszeile fallen weg, der Inhalt bleibt
 *   als normaler Text stehen;
 * - ein nicht geschlossener Block wird am Ende geschlossen (bzw. aufgelöst, wenn er auch sonst ungültig ist), ein
 *   überzähliges `:::` entfernt, ein nicht geschlossener Codeblock am Ende geschlossen;
 * - ein unbekannter Hinweis-Marker wird zu `[!NOTE]`;
 * - eine ungültige oder nicht geschlossene Simulation (```simulation) fällt ganz weg: halbes JSON hilft niemandem.
 * Danach meldet validateLearningBlocks() für den Text keine Fehler mehr.
 */
export function repairLearningBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const drop = new Set<number>();
  const stack: Array<Open & { index: number }> = [];
  let fence: (Fence & { index: number }) | null = null;

  const invalid = (b: Open) =>
    !KNOWN_DIRECTIVES.has(b.name) ||
    (b.name === "steps" && b.items < 2) ||
    (b.name === "tabs" && b.tabs < 2) ||
    (b.name === "practice" && ["scenario", "task", "solution", "why"].some((p) => !b.headings.has(p)));

  const dropRange = (from: number, to: number) => {
    for (let k = from; k <= to; k++) drop.add(k);
  };

  lines.forEach((line, i) => {
    const f = FENCE_OPEN.exec(line);
    if (f && !fence) {
      fence = { char: f[1][0], len: f[1].length, line: i + 1, sim: isSimLang(f[2]), body: [], index: i };
      return;
    }
    if (fence) {
      if (f && f[1][0] === fence.char && f[1].length >= fence.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) {
        if (fence.sim && !parseSimulation(fence.body.join("\n")).ok) dropRange(fence.index, i);
        fence = null;
      } else fence.body.push(line);
      return;
    }
    const d = /^(:{3,})\s*([A-Za-z][\w-]*)?/.exec(line);
    if (d && !/^::[^:]/.test(line)) {
      if (d[2]) {
        stack.push({ name: d[2], colons: d[1].length, line: i + 1, headings: new Set(), tabs: 0, items: 0, index: i });
      } else {
        const top = stack.pop();
        if (!top) drop.add(i);
        else if (invalid(top)) {
          drop.add(top.index);
          drop.add(i);
        }
      }
      return;
    }
    const top = stack[stack.length - 1];
    if (top) {
      if (/^::tab\[/.test(line)) top.tabs++;
      const h = /^#{3}\s+(.+?)\s*$/.exec(line);
      if (h) top.headings.add(PRACTICE_HEADINGS[h[1].toLowerCase().replace(/[:.]/g, "")] ?? "?");
      if (top.name === "steps" && STEP_ITEM.test(line)) top.items++;
    }
    const c = /^(\s*>\s*\[!)([A-Za-z]+)(\].*)$/.exec(line);
    if (c && !KNOWN_CALLOUTS.has(c[2].toUpperCase())) lines[i] = `${c[1]}NOTE${c[3]}`;
  });

  // Offene Blöcke von innen nach außen: ungültige auflösen, gültige am Ende schließen.
  const closers: string[] = [];
  for (const open of [...stack].reverse()) {
    if (invalid(open)) drop.add(open.index);
    else closers.push(":".repeat(open.colons));
  }
  const openFence = fence as (Fence & { index: number }) | null;
  if (openFence?.sim) dropRange(openFence.index, lines.length - 1);
  const out = lines.filter((_, i) => !drop.has(i));
  if (openFence && !openFence.sim) out.push(openFence.char.repeat(openFence.len));
  out.push(...closers);
  return out.join("\n");
}
