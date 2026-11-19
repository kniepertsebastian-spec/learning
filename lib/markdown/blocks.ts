import type { Root, Parent, Paragraph, Text, Code, Heading, ListItem, List, RootContent, PhrasingContent } from "mdast";
import type { VFile } from "vfile";
import { visit, SKIP } from "unist-util-visit";
import { parseSimulation, SIMULATION_LANG } from "./simulation";

/**
 * Remark-Plugin für die Inhaltsblöcke der Lernmaterialien (docs/roadmaps/archiv/ROADMAP-UI.md U5). Läuft nach `remark-directive` und
 * übersetzt in mdast-Knoten mit `data.hName`/`hProperties`, die RichText in Komponenten abbildet:
 *
 *  - `> [!EXAM]` / `[!MISTAKE]` / `[!MEMO]` / `[!NOTE]` / `[!POSSIBLE]`  → div[data-callout]
 *  - ```console / ```terminal                              → pre[data-terminal]
 *  - Codeblöcke mit `title="…"` und `{7-8}`                → code[data-title][data-lines]
 *  - `:::tabs` mit `::tab[Label]`                          → div[data-block=tabs] > div[data-tab]
 *  - `:::steps` mit Listenpunkten `Label | Befehl`         → div[data-block=steps] > div[data-step]
 *  - `:::practice` mit ### Szenario / Aufgabe / Lösung / Warum → div[data-block=practice] > div[data-part]
 *  - ```simulation mit gültigem JSON (lib/markdown/simulation.ts) → div[data-block=simulation][data-spec]
 *
 * Unbekannte oder unvollständige Direktiven werden als der ursprüngliche Text gezeigt, nie als HTML. Das ist wichtig,
 * weil `remark-directive` auch gewöhnlichen Text wie „Port:443“ als Text-Direktive liest.
 */

export type CalloutKind = "exam" | "mistake" | "memo" | "info" | "possible";
const CALLOUT_MARKERS: Record<string, CalloutKind> = { EXAM: "exam", MISTAKE: "mistake", MEMO: "memo", NOTE: "info", POSSIBLE: "possible" };

export const PRACTICE_PARTS = ["scenario", "task", "solution", "why"] as const;
export type PracticePart = (typeof PRACTICE_PARTS)[number];
const PART_BY_HEADING: Record<string, PracticePart> = {
  szenario: "scenario",
  scenario: "scenario",
  aufgabe: "task",
  task: "task",
  lösung: "solution",
  loesung: "solution",
  solution: "solution",
  warum: "why",
  why: "why",
};

type DirectiveNode = Parent & { type: "containerDirective" | "leafDirective" | "textDirective"; name: string; attributes?: Record<string, string | null | undefined>; position?: { start: { offset?: number }; end: { offset?: number } } };
type AnyNode = RootContent & { data?: { hName?: string; hProperties?: Record<string, unknown> } };

function setHast(node: { data?: unknown }, hName: string, hProperties: Record<string, unknown> = {}) {
  const data = ((node as { data?: { hName?: string; hProperties?: Record<string, unknown> } }).data ??= {});
  data.hName = hName;
  data.hProperties = { ...(data.hProperties ?? {}), ...hProperties };
}

function plainText(node: unknown): string {
  const n = node as { value?: string; children?: unknown[] };
  if (typeof n.value === "string") return n.value;
  return (n.children ?? []).map(plainText).join("");
}

/** Zeilenbereiche wie `7-8,12` aus `{7-8,12}`; ungültige Teile werden ignoriert. */
export function parseLineRanges(spec: string | null | undefined): number[] {
  if (!spec) return [];
  const lines = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from || to - from > 500) continue;
    for (let i = from; i <= to; i++) lines.add(i);
  }
  return [...lines].sort((a, b) => a - b);
}

/** `title="a.yaml" {7-8}` → { title, lines } (Reihenfolge egal). */
export function parseCodeMeta(meta: string | null | undefined): { title: string | null; lines: number[] } {
  if (!meta) return { title: null, lines: [] };
  const title = /title\s*=\s*"([^"]{1,120})"/.exec(meta)?.[1] ?? /title\s*=\s*'([^']{1,120})'/.exec(meta)?.[1] ?? null;
  const braces = /\{([^}]*)\}/.exec(meta)?.[1];
  return { title, lines: parseLineRanges(braces) };
}

export const TERMINAL_LANGS = new Set(["console", "terminal", "shell-session"]);

/** Nur die Befehle eines Terminal-Blocks (Zeilen mit `$ `), ohne Prompt und ohne Ausgabe – das landet beim Kopieren in der Zwischenablage. */
export function terminalCommands(code: string): string {
  return code
    .split("\n")
    .filter((l) => /^\$ /.test(l))
    .map((l) => l.replace(/^\$ /, ""))
    .join("\n");
}

function rawOf(node: DirectiveNode, source: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return "";
  return source.slice(start, end);
}

function textNode(value: string): Text {
  return { type: "text", value };
}

function wrap(children: RootContent[], hName: string, props: Record<string, unknown>): Parent {
  const node = { type: "paragraph", children } as Parent;
  setHast(node, hName, props);
  return node;
}

function toRawParagraph(raw: string): Paragraph {
  return { type: "paragraph", children: [textNode(raw)] };
}

/** Beschriftung in `[…]`: bei Leaf-Direktiven stehen die Inhalte direkt in `children`, bei Containern in einem Absatz mit `directiveLabel`. */
function directiveLabel(node: DirectiveNode): string {
  const first = node.children?.[0] as (Paragraph & { data?: { directiveLabel?: boolean } }) | undefined;
  if (first?.data?.directiveLabel) return plainText(first).trim();
  return plainText(node).trim() || (node.attributes?.label ?? "").toString();
}

function buildTabs(node: DirectiveNode): Parent | null {
  const tabs: Array<{ label: string; children: RootContent[] }> = [];
  for (const child of node.children as AnyNode[]) {
    const c = child as unknown as DirectiveNode;
    if (c.type === "leafDirective" && c.name === "tab") {
      tabs.push({ label: directiveLabel(c) || `${tabs.length + 1}`, children: [] });
    } else if (tabs.length > 0) {
      tabs[tabs.length - 1].children.push(child);
    } else {
      return null; // Inhalt vor dem ersten ::tab → ungültig
    }
  }
  if (tabs.length < 2 || tabs.some((t) => t.children.length === 0)) return null;
  const parts = tabs.map((t) => wrap(t.children, "div", { "data-tab": t.label }));
  return wrap(parts as RootContent[], "div", { "data-block": "tabs" });
}

function buildSteps(node: DirectiveNode): Parent | null {
  const list = (node.children as AnyNode[]).find((c) => c.type === "list") as List | undefined;
  if (!list || list.children.length < 2) return null;
  const steps = list.children.map((item: ListItem) => {
    const text = plainText(item).trim();
    const [label, ...rest] = text.split("|");
    const detail = rest.join("|").trim();
    return wrap(detail ? ([{ type: "inlineCode", value: detail }] as RootContent[]) : [], "div", { "data-step": label.trim() });
  });
  return wrap(steps as RootContent[], "div", { "data-block": "steps" });
}

function buildPractice(node: DirectiveNode): Parent | null {
  const parts = new Map<PracticePart, RootContent[]>();
  let current: PracticePart | null = null;
  for (const child of node.children as AnyNode[]) {
    if (child.type === "heading") {
      const key = plainText(child as Heading).trim().toLowerCase().replace(/[:.]/g, "");
      const part = PART_BY_HEADING[key];
      if (!part || parts.has(part)) return null;
      parts.set(part, []);
      current = part;
    } else if (current) {
      parts.get(current)!.push(child);
    } else {
      return null;
    }
  }
  if (PRACTICE_PARTS.some((p) => !parts.get(p) || parts.get(p)!.length === 0)) return null;
  const children = PRACTICE_PARTS.map((p) => wrap(parts.get(p)!, "div", { "data-part": p }));
  const minutes = node.attributes?.minutes ?? node.attributes?.min ?? null;
  return wrap(children as RootContent[], "div", { "data-block": "practice", ...(minutes && /^\d{1,3}$/.test(String(minutes)) ? { "data-minutes": String(minutes) } : {}) });
}

export function remarkLearningBlocks() {
  return (tree: Root, file: VFile) => {
    const source = String(file.value ?? "");

    // Container-Direktiven von innen nach außen (verschachtelte :::tabs in :::practice).
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;
      const d = node as unknown as DirectiveNode;

      if (d.type === "textDirective" || d.type === "leafDirective") {
        if (d.type === "leafDirective" && d.name === "tab") return; // wird von :::tabs verbraucht
        (parent.children as RootContent[])[index] = (d.type === "textDirective" ? textNode(rawOf(d, source)) : toRawParagraph(rawOf(d, source))) as RootContent;
        return SKIP;
      }
      return;
    });

    const containers: Array<{ node: DirectiveNode; parent: Parent; index: number; depth: number }> = [];
    visit(tree, (node, index, parent, ...rest) => {
      void rest;
      if (!parent || index === undefined) return;
      if ((node as { type: string }).type === "containerDirective") containers.push({ node: node as unknown as DirectiveNode, parent: parent as Parent, index, depth: 0 });
      return;
    });
    // innerste zuerst: spätere Einträge in Dokumentreihenfolge sind tiefer oder später; rückwärts abarbeiten
    for (const c of containers.reverse()) {
      const siblings = c.parent.children as RootContent[];
      const at = siblings.indexOf(c.node as unknown as RootContent);
      if (at < 0) continue;
      const built = c.node.name === "tabs" ? buildTabs(c.node) : c.node.name === "steps" ? buildSteps(c.node) : c.node.name === "practice" ? buildPractice(c.node) : null;
      siblings[at] = (built ?? toRawParagraph(rawOf(c.node, source))) as RootContent;
    }

    // Hinweise: > [!EXAM] …
    visit(tree, "blockquote", (node) => {
      const first = node.children[0];
      if (first?.type !== "paragraph") return;
      const head = first.children[0];
      if (head?.type !== "text") return;
      const m = /^\[!(EXAM|MISTAKE|MEMO|NOTE|POSSIBLE)\][ \t]*\n?/.exec(head.value);
      if (!m) return;
      head.value = head.value.slice(m[0].length);
      if (head.value === "") first.children.shift();
      if (first.children.length === 0) node.children.shift();
      setHast(node, "div", { "data-callout": CALLOUT_MARKERS[m[1]] });
    });

    // Simulationen: gültiges JSON wird zum interaktiven Block, ungültiges bleibt ein gewöhnlicher Codeblock.
    visit(tree, "code", (node: Code, index, parent) => {
      if (!parent || index === undefined || (node.lang ?? "").toLowerCase() !== SIMULATION_LANG) return;
      if (!parseSimulation(node.value).ok) return;
      (parent.children as RootContent[])[index] = wrap([], "div", { "data-block": "simulation", "data-spec": node.value }) as RootContent;
      return SKIP;
    });

    // Codeblöcke: Meta (title, Zeilen) und Terminal weiterreichen
    visit(tree, "code", (node: Code) => {
      const meta = parseCodeMeta(node.meta);
      const lang = (node.lang ?? "").toLowerCase();
      const data = (node.data ??= {}) as { hProperties?: Record<string, unknown> };
      data.hProperties = {
        ...(data.hProperties ?? {}),
        ...(meta.title ? { "data-title": meta.title } : {}),
        ...(meta.lines.length ? { "data-lines": meta.lines.join(",") } : {}),
        ...(TERMINAL_LANGS.has(lang) ? { "data-terminal": "true" } : {}),
      };
    });
  };
}

export type { PhrasingContent };
