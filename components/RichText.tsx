"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.min.css";

/**
 * Text von Fragen, Antwortoptionen und Erklärungen als Markdown: Logs, Befehle und Konfigurationen stehen in
 * Codeblöcken (mit Zeilenumbrüchen und Einrückung), einzelne Befehle und Pfade in `Backticks`. Sicher für KI-Text:
 * rohes HTML wird nicht ausgeführt (nur als Text gezeigt), Links sind keine Links, Bilder entfallen.
 * `inline`: für Antwortknöpfe, Absätze werden zu laufendem Text statt zu Blöcken.
 */
const baseComponents: Components = {
  a: ({ children }) => <span className="underline">{children}</span>,
  img: () => null,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100">{children}</pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
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

export function RichText({ text, inline = false }: { text: string; inline?: boolean }) {
  return (
    <div className={inline ? "min-w-0" : ""} data-testid="rich-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={inline ? inlineComponents : blockComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
