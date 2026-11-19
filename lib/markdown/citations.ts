import type { Parent, PhrasingContent, Root, Text } from "mdast";
import { visit, SKIP } from "unist-util-visit";

/**
 * Quellenbelege der Kursgenerierung im Lerntext (token_architektur_roadmap Abschnitt 4):
 *  - `[SRC_07]` / `[SRC_04, SRC_12]` → kleine hochgestellte Nummer `7` / `4, 12` mit Tooltip „Quelle SRC_07“
 *  - `[QUELLE FEHLT: Beschreibung]`  → hervorgehobener Hinweis, damit die Lücke beim Prüfen auffällt
 *
 * Im gespeicherten Text bleiben die Tags unverändert (Übersetzung, Audit und Editor arbeiten damit); nur die Anzeige ändert
 * sich. Codeblöcke und Inline-Code sind eigene Knoten und bleiben unberührt.
 */
const TAG = /\[(SRC_\d+(?:\s*[,;]\s*SRC_\d+)*)\]|\[QUELLE FEHLT:\s*([^\]]*)\]/g;

export function citationLabel(group: string): string {
  return group
    .split(/\s*[,;]\s*/)
    .map((id) => String(Number(/(\d+)$/.exec(id)?.[1] ?? id)))
    .join(", ");
}

function splitText(value: string): PhrasingContent[] | null {
  TAG.lastIndex = 0;
  if (!TAG.test(value)) return null;
  TAG.lastIndex = 0;
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const match of value.matchAll(TAG)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    if (match[1] !== undefined) {
      const ids = match[1].split(/\s*[,;]\s*/).join(", ");
      out.push({
        type: "text",
        value: citationLabel(match[1]),
        data: { hName: "sup", hProperties: { className: ["ml-0.5", "text-[0.7em]", "text-subtle"], title: `Quelle ${ids}`, dataCitation: ids } },
      } as Text);
    } else {
      out.push({
        type: "text",
        value: `Quelle fehlt: ${match[2].trim()}`,
        data: { hName: "span", hProperties: { className: ["rounded", "bg-warning-soft", "px-1", "text-warning-text"], dataMissingSource: "true" } },
      } as Text);
    }
    last = start + match[0].length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

export function remarkSourceCitations() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || node.data?.hName) return;
      const parts = splitText(node.value);
      if (!parts) return;
      parent.children.splice(index, 1, ...(parts as typeof parent.children));
      return [SKIP, index + parts.length];
    });
  };
}
