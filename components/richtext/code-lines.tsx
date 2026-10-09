import * as React from "react";

/** Text eines React-Teilbaums (für Kopieren und Terminal-Auswertung). */
export function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (React.isValidElement(node)) return nodeText((node.props as { children?: React.ReactNode }).children);
  return "";
}

type Wrapper = (children: React.ReactNode[]) => React.ReactNode;

/**
 * Teilt einen (von highlight.js gefärbten) Teilbaum in Zeilen. Spans, die einen Zeilenumbruch enthalten, werden je Zeile
 * geklont, damit Farben und Zeilenmarkierung zusammen funktionieren.
 */
export function splitLines(children: React.ReactNode): React.ReactNode[][] {
  const lines: React.ReactNode[][] = [[]];
  let key = 0;
  function walk(node: React.ReactNode, wrappers: Wrapper[]) {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, wrappers));
      return;
    }
    if (typeof node === "string" || typeof node === "number") {
      String(node)
        .split("\n")
        .forEach((part, i) => {
          if (i > 0) lines.push([]);
          if (part !== "") lines[lines.length - 1].push(wrappers.reduceRight<React.ReactNode>((acc, w) => w([acc]), part));
        });
      return;
    }
    if (React.isValidElement(node)) {
      const el = node as React.ReactElement<{ children?: React.ReactNode }>;
      const wrapper: Wrapper = (c) => React.cloneElement(el, { key: `s${key++}` }, ...c);
      walk(el.props.children, [...wrappers, wrapper]);
    }
  }
  walk(children, []);
  // Ein abschließender Zeilenumbruch erzeugt keine leere letzte Zeile.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}
