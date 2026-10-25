/**
 * Formeln und Brüche (roadmap_bugs_features 4.1): KI-Text und Handtexte schreiben Mathematik unterschiedlich (`$\frac{a}{b}$`,
 * `\(a/b\)`, `\[...\]`, ein nacktes `\frac{a}{b}`). Vor dem Markdown-Parser wird das auf eine einzige Schreibweise gebracht, die
 * remark-math versteht: `$$...$$` (Einzel-Dollar ist dort abgeschaltet, damit „5 $ bis 10 $“ nie als Formel gilt). Codeblöcke und
 * `Backticks` bleiben unberührt.
 */

const FRAC = /^\\[dt]?frac(?![a-zA-Z])/;

/** Sieht der Inhalt zwischen zwei Dollarzeichen nach Mathematik aus? (Befehl, Hoch-/Tiefstellung, Klammern); nie bei Währungen. */
function looksLikeMath(expr: string): boolean {
  if (!expr || /^\s|\s$/.test(expr)) return false;
  return /\\[a-zA-Z]+|[\^_{}]/.test(expr);
}

/** Findet das Ende einer geschweiften Gruppe, die bei `start` (`{`) beginnt; -1 bei unausgewogenen Klammern. */
function endOfGroup(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function convertProse(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    // Schon in der Zielschreibweise: unverändert übernehmen.
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1) {
        out += text.slice(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\(", i)) {
      const end = text.indexOf("\\)", i + 2);
      if (end !== -1 && !text.slice(i + 2, end).includes("\n\n")) {
        out += `$$${text.slice(i + 2, end).trim()}$$`;
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("\\[", i)) {
      const end = text.indexOf("\\]", i + 2);
      if (end !== -1) {
        out += `\n\n$$\n${text.slice(i + 2, end).trim()}\n$$\n\n`;
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "$" && !text.startsWith("$$", i)) {
      const lineEnd = text.indexOf("\n", i);
      const end = text.indexOf("$", i + 1);
      if (end !== -1 && (lineEnd === -1 || end < lineEnd) && text[end + 1] !== "$" && !/\d/.test(text[end + 1] ?? "")) {
        const inner = text.slice(i + 1, end);
        if (looksLikeMath(inner)) {
          out += `$$${inner}$$`;
          i = end + 1;
          continue;
        }
      }
    }
    if (text[i] === "\\" && FRAC.test(text.slice(i))) {
      const cmd = text.slice(i).match(FRAC)![0];
      const numStart = i + cmd.length;
      if (text[numStart] === "{") {
        const numEnd = endOfGroup(text, numStart);
        if (numEnd !== -1 && text[numEnd + 1] === "{") {
          const denEnd = endOfGroup(text, numEnd + 1);
          if (denEnd !== -1) {
            out += `$$${text.slice(i, denEnd + 1)}$$`;
            i = denEnd + 1;
            continue;
          }
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/** Bringt alle Formelschreibweisen auf `$$...$$`; Code (Zäune und Backticks) bleibt wie er ist. */
export function normalizeMath(text: string): string {
  if (!/[\\$]/.test(text)) return text;
  // In Code-Stücke (unverändert) und Fließtext (wird umgeschrieben) zerlegen.
  const parts: Array<{ code: boolean; text: string }> = [];
  const code = /(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\3[ \t]*(?=\n|$)|$)|`[^`\n]+`/g;
  let last = 0;
  for (const m of text.matchAll(code)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ code: false, text: text.slice(last, start) });
    parts.push({ code: true, text: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ code: false, text: text.slice(last) });
  return parts.map((p) => (p.code ? p.text : convertProse(p.text))).join("");
}
