import type { ComponentProps } from "react";
import type ReactMarkdown from "react-markdown";
import { rehypeHighlightCode } from "@/lib/markdown/highlight";

export { baseRemarkPlugins } from "@/components/richtext/markdown-plugins";

type Props = ComponentProps<typeof ReactMarkdown>;

/** Highlighting-Plugins; nur aus nachgeladenen Renderern (CodeMarkdown, MathMarkdown) importieren, nie aus RichText selbst. */
export const highlightRehypePlugins = [rehypeHighlightCode] as NonNullable<Props["rehypePlugins"]>;
