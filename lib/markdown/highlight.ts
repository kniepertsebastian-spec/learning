import { createLowlight } from "lowlight";
import { visit } from "unist-util-visit";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { TERMINAL_LANGS } from "./blocks";

/**
 * Syntax-Highlighting für Codeblöcke in RichText, mit einer festen Sprachauswahl statt des `common`-Pakets von
 * rehype-highlight (37 Sprachen, das ganze Paket landet sonst in jedem Client-Bundle, auch mit `languages`-Option, weil
 * rehype-highlight `common` fest importiert). Ausgewählt nach den Sprachen, die in den Kursinhalten wirklich vorkommen
 * (Stand 11/2026: bash, yaml, python, json, markdown, xml, ini/toml, typescript, go, sql) plus den in IT-Zertifizierungen
 * üblichen (PowerShell, Dockerfile, nginx, JavaScript, Java, C#, diff).
 *
 * Nicht dabei, weil highlight.js sie nicht kennt: hcl/terraform, Cisco IOS, PromQL, KQL; die bleiben ungefärbte Codeblöcke
 * wie bisher. Terminal-Blöcke (```console) zeigt TerminalBlock ohne Färbung, sie werden gar nicht erst zerlegt.
 * Verhalten sonst wie rehype-highlight (ohne Sprachangabe keine Färbung, keine automatische Erkennung).
 */
export const HIGHLIGHT_LANGUAGES = {
  bash,
  csharp,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  nginx,
  plaintext,
  powershell,
  python,
  shell,
  sql,
  typescript,
  xml,
  yaml,
};

/** Ohne Färbung: Klartext und Terminal-Blöcke (eigene Darstellung). */
const PLAIN = new Set(["text", "txt", "plain", "plaintext", "no-highlight", "nohighlight", ...TERMINAL_LANGS]);

const lowlight = createLowlight(HIGHLIGHT_LANGUAGES);

type HastText = { type: "text"; value: string };
type HastElement = { type: "element"; tagName: string; properties: Record<string, unknown>; children: HastNode[] };
type HastNode = HastText | HastElement | { type: string; children?: HastNode[]; value?: string };

function languageOf(node: HastElement): string | null {
  const list = node.properties.className;
  if (!Array.isArray(list)) return null;
  for (const value of list.map(String)) {
    if (value.startsWith("language-")) return value.slice(9).toLowerCase();
    if (value.startsWith("lang-")) return value.slice(5).toLowerCase();
  }
  return null;
}

function textOf(node: HastNode): string {
  if (node.type === "text") return (node as HastText).value;
  return "children" in node && Array.isArray(node.children) ? node.children.map(textOf).join("") : "";
}

export function isHighlightable(lang: string): boolean {
  return !PLAIN.has(lang) && lowlight.registered(lang);
}

/** Rehype-Plugin: färbt `pre > code.language-x` mit lowlight, unbekannte Sprachen bleiben unverändert. */
export function rehypeHighlightCode() {
  return (tree: unknown) => {
    visit(tree as HastElement, "element", (node: HastElement, _index, parent) => {
      if (node.tagName !== "code" || !parent || (parent as HastElement).tagName !== "pre") return;
      const lang = languageOf(node);
      if (!lang || !isHighlightable(lang)) return;
      const classes = (node.properties.className as unknown[]).map(String);
      if (!classes.includes("hljs")) node.properties.className = ["hljs", ...classes];
      const result = lowlight.highlight(lang, textOf(node));
      if (result.children.length > 0) node.children = result.children as HastNode[];
    });
  };
}
