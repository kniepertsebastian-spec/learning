"use client";

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { baseRemarkPlugins, highlightRehypePlugins } from "@/components/richtext/code-plugins";

type Props = ComponentProps<typeof ReactMarkdown>;

/**
 * RichText mit Syntax-Highlighting für Codeblöcke. Eigener Chunk (next/dynamic in RichText): lowlight und die Grammatiken
 * (lib/markdown/highlight.ts) werden nur geladen, wenn ein Text einen Codeblock mit Sprachangabe enthält.
 */
const rehypePlugins = highlightRehypePlugins as NonNullable<Props["rehypePlugins"]>;

export function CodeMarkdown({ text, components }: { text: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={baseRemarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {text}
    </ReactMarkdown>
  );
}
