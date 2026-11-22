/**
 * Enthält der Text einen eingezäunten Codeblock mit Sprachangabe (```bash, ~~~yaml)? Nur dann braucht RichText das
 * Syntax-Highlighting (lowlight + Grammatiken, eigener Chunk). Ohne Sprachangabe färbt rehypeHighlightCode ohnehin nichts.
 * Bewusst großzügig: ein Treffer zu viel lädt nur den Chunk, einer zu wenig ließe Code ungefärbt.
 */
const FENCE_WITH_LANGUAGE = /(?:^|\n)[ \t>]*(?:`{3,}|~{3,})[ \t]*[\w+#.-]/;

export function hasHighlightableCode(text: string): boolean {
  return FENCE_WITH_LANGUAGE.test(text);
}
