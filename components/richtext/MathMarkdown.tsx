"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { baseRemarkPlugins, highlightRehypePlugins } from "@/components/richtext/code-plugins";

type Props = ComponentProps<typeof ReactMarkdown>;

/**
 * Formeln und Brüche: `$$…$$` (inline oder abgesetzt) wird mit KaTeX gesetzt. Einzel-Dollar ist abgeschaltet, damit Währungen
 * nie als Formel gelten; `normalizeMath` bringt andere Schreibweisen (`$…$`, `\(…\)`, `\[…\]`, nacktes `\frac`) vorher auf
 * `$$…$$`. Fehlerhafte Formeln zeigen ihren Quelltext statt die Seite zu brechen.
 *
 * Eigener Chunk (next/dynamic in RichText): KaTeX (JS + CSS) wird nur geladen, wenn ein Text wirklich Formeln enthält.
 */
const remarkPlugins = [...baseRemarkPlugins, [remarkMath, { singleDollarTextMath: false }]] as NonNullable<Props["remarkPlugins"]>;
// Texte mit Formeln enthalten oft auch Code: das Highlighting gehört hier dazu (beides nachgeladen).
const rehypePlugins = [...highlightRehypePlugins, [rehypeKatex, { throwOnError: false, strict: "ignore", output: "htmlAndMathml" }]] as NonNullable<Props["rehypePlugins"]>;

export function MathMarkdown({ text, components }: { text: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {text}
    </ReactMarkdown>
  );
}
