import type { ComponentProps } from "react";
import type ReactMarkdown from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { remarkLearningBlocks } from "@/lib/markdown/blocks";
import { remarkSourceCitations } from "@/lib/markdown/citations";
import { rehypeHighlightCode } from "@/lib/markdown/highlight";

type Props = ComponentProps<typeof ReactMarkdown>;

/**
 * Plugins, die RichText für jeden Text braucht. Formeln (remark-math + rehype-katex) hängt erst der nachgeladene
 * MathMarkdown-Renderer an, damit KaTeX samt CSS nur auf Seiten mit Formeln im Bundle landet.
 */
export const baseRemarkPlugins = [remarkGfm, remarkDirective, remarkLearningBlocks, remarkSourceCitations] as NonNullable<Props["remarkPlugins"]>;
export const baseRehypePlugins = [rehypeHighlightCode] as NonNullable<Props["rehypePlugins"]>;
