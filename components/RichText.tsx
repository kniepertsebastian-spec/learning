"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { CalloutBlock, PracticeBlock, StepsBlock, TabsBlock } from "@/components/richtext/Blocks";
import { CodeBlock, TerminalBlock } from "@/components/richtext/CodeBlock";
import { baseRehypePlugins, baseRemarkPlugins } from "@/components/richtext/markdown-plugins";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLineRanges } from "@/lib/markdown/blocks";
import { hasMath, normalizeMath } from "@/lib/markdown/math";
import { nodeText } from "@/components/richtext/code-lines";
import { slugify } from "@/lib/markdown/toc";
import type { CalloutTone } from "@/components/ui/callout";

/**
 * Text von Fragen, Antwortoptionen, Erklärungen und Lektionen als Markdown: Logs, Befehle und Konfigurationen stehen in
 * Codeblöcken (mit Zeilenumbrüchen und Einrückung), einzelne Befehle und Pfade in `Backticks`. Sicher für KI-Text:
 * rohes HTML wird nicht ausgeführt (nur als Text gezeigt), Links sind keine Links, Bilder entfallen.
 * Lernblöcke (Hinweise, Terminal, Tabs, Schritte, Praxisbeispiel, Simulation) siehe lib/markdown/blocks.ts.
 * `inline`: für Antwortknöpfe, Absätze werden zu laufendem Text statt zu Blöcken.
 *
 * Highlighting: bewusst bei highlight.js geblieben statt Shiki/rehype-pretty-code: RichText wird in Client-Komponenten
 * (Quiz, Offline-Reader) genutzt und lässt sich nicht ohne großen Umbau zur Server-Komponente machen; Kopfzeile und
 * Zeilenmarkierung ergänzen wir selbst (CodeBlock). Die Farben kommen aus den Tokens (`--code-*`). Nur eine feste
 * Sprachauswahl (lib/markdown/highlight.ts), nicht das ganze highlight.js-Paket.
 *
 * Bundle: KaTeX (Formeln) und die interaktiven Simulationen sind eigene Chunks (next/dynamic) und werden nur geladen, wenn
 * ein Text sie braucht. Beim ersten Seitenaufruf rendert der Server beides fertig mit (kein Layout-Sprung); bei
 * Client-Navigation steht bis zum Nachladen der Text ohne Formelsatz bzw. ein Platzhalter in Simulationsgröße da.
 * Offline sind die Chunks über den Precache des Service Workers verfügbar.
 */
const SimulationBlock = dynamic(() => import("@/components/richtext/Simulation").then((m) => m.SimulationBlock), {
  loading: () => <Skeleton className="my-4 h-64 rounded-2xl" data-testid="simulation-loading" />,
});
const MathMarkdown = dynamic(() => import("@/components/richtext/MathMarkdown").then((m) => m.MathMarkdown));

function pickData(props: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(props).filter(([k, v]) => k.startsWith("data-") && typeof v === "string")) as Record<string, string>;
}

const baseComponents: Components = {
  a: ({ children }) => <span className="underline">{children}</span>,
  img: () => null,
  pre: ({ children }) => {
    const code = React.Children.toArray(children).find((c): c is React.ReactElement<{ className?: string; children?: React.ReactNode }> => React.isValidElement(c));
    if (!code) return <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-surface-inset p-3 text-xs leading-relaxed">{children}</pre>;
    // mdast-util-to-hast legt die Daten aus dem Plugin auf das <code>-Element, nicht auf <pre>.
    const p = code.props as Record<string, unknown>;
    const lines = typeof p["data-lines"] === "string" ? parseLineRanges(p["data-lines"] as string) : [];
    if (p["data-terminal"]) return <TerminalBlock code={code} lines={lines} />;
    return <CodeBlock code={code} title={typeof p["data-title"] === "string" ? (p["data-title"] as string) : null} lines={lines} />;
  },
  code: ({ className, children, ...rest }) =>
    className ? (
      <code className={className} {...pickData(rest)}>{children}</code>
    ) : (
      <code className="rounded bg-control px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
  div: ({ children, ...props }) => {
    const p = props as Record<string, unknown>;
    const callout = p["data-callout"];
    if (typeof callout === "string") return <CalloutBlock kind={callout as CalloutTone}>{children}</CalloutBlock>;
    const block = p["data-block"];
    if (block === "tabs") return <TabsBlock>{children}</TabsBlock>;
    if (block === "steps") return <StepsBlock>{children}</StepsBlock>;
    if (block === "simulation" && typeof p["data-spec"] === "string") return <SimulationBlock spec={p["data-spec"] as string} />;
    if (block === "practice") return <PracticeBlock minutes={typeof p["data-minutes"] === "string" ? (p["data-minutes"] as string) : undefined}>{children}</PracticeBlock>;
    return <div>{children}</div>;
  },
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-[14px] border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-surface px-3 py-2 text-xs font-semibold text-subtle">{children}</th>,
  td: ({ children }) => <td className="border-t border-border-subtle px-3 py-2 align-top first:font-mono first:text-mint-text">{children}</td>,
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
};

const inlineComponents: Components = {
  ...baseComponents,
  p: ({ children }) => <>{children}</>,
};

const blockComponents: Components = {
  ...baseComponents,
  p: ({ children }) => <p className="my-1 whitespace-pre-line">{children}</p>,
};

/** Überschriften mit Ankern (gleiche Regeln wie `extractToc`), damit „Auf dieser Seite“ dorthin springen kann. */
function withHeadingIds(base: Components): Components {
  const seen = new Map<string, number>();
  return {
    ...base,
    h2: ({ children }) => {
      const slug = slugify(nodeText(children).replace(/[`*_]/g, "").trim());
      const n = seen.get(slug) ?? 0;
      seen.set(slug, n + 1);
      return <h2 id={n === 0 ? slug : `${slug}-${n + 1}`} className="mt-8 mb-2 scroll-mt-24 text-question leading-tight font-semibold tracking-tight">{children}</h2>;
    },
    h3: ({ children }) => <h3 className="mt-5 mb-1.5 text-lead font-semibold">{children}</h3>,
  };
}

export const RichText = React.memo(function RichText({ text, inline = false, headingIds = false }: { text: string; inline?: boolean; headingIds?: boolean }) {
  const components = React.useMemo(
    () => (inline ? inlineComponents : headingIds ? withHeadingIds(blockComponents) : blockComponents),
    [inline, headingIds],
  );
  const normalized = React.useMemo(() => normalizeMath(text), [text]);
  const plain = (
    <ReactMarkdown remarkPlugins={baseRemarkPlugins} rehypePlugins={baseRehypePlugins} components={components}>
      {normalized}
    </ReactMarkdown>
  );
  return (
    <div className={inline ? "min-w-0" : ""} data-testid="rich-text">
      {hasMath(normalized) ? (
        // Bis KaTeX geladen ist (nur bei Client-Navigation): derselbe Text ohne Formelsatz statt eines leeren Kastens.
        <React.Suspense fallback={plain}>
          <MathMarkdown text={normalized} components={components} />
        </React.Suspense>
      ) : (
        plain
      )}
    </div>
  );
});
