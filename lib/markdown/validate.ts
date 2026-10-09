/**
 * Qualitätsprüfung der Lernblöcke in generiertem Lernstoff (docs/ROADMAP-UI.md U5): Direktiven müssen geschlossen sein,
 * `:::practice` braucht alle vier Teile, `:::tabs` mindestens zwei `::tab[…]`, Hinweise nur mit bekannten Markern, Codeblöcke
 * geschlossen. Fehlende Blöcke sind kein Fehler (der Prompt verlangt sie, die Quelle entscheidet). Liefert Fehlertexte.
 */
const KNOWN_DIRECTIVES = new Set(["tabs", "steps", "practice"]);
const KNOWN_CALLOUTS = new Set(["EXAM", "MISTAKE", "MEMO", "NOTE"]);
const PRACTICE_HEADINGS: Record<string, string> = { szenario: "scenario", scenario: "scenario", aufgabe: "task", task: "task", lösung: "solution", loesung: "solution", solution: "solution", warum: "why", why: "why" };

type Open = { name: string; colons: number; line: number; headings: Set<string>; tabs: number; items: number };

export function validateLearningBlocks(markdown: string): string[] {
  const errors: string[] = [];
  const stack: Open[] = [];
  let fence: { char: string; len: number; line: number } | null = null;
  const lines = markdown.split("\n");

  lines.forEach((raw, i) => {
    const line = raw;
    const n = i + 1;
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = { char: f[1][0], len: f[1].length, line: n };
      else if (f[1][0] === fence.char && f[1].length >= fence.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) fence = null;
      return;
    }
    if (fence) return;

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
      if (top.name === "steps" && /^\s*[-*]\s+\S/.test(line)) top.items++;
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
