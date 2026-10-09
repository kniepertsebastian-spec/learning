/**
 * Tastenkürzel im Quiz und in der Prüfung (docs/ROADMAP-UI.md U4): A–D bzw. 1–4 wählen, Enter weiter/bestätigen,
 * F markieren, Esc schließen. Aktiv nur, wenn kein Eingabefeld fokussiert ist und keine Strg-/Alt-/Meta-Taste gedrückt wird.
 */
export type QuizKeyAction = { type: "pick"; index: number } | { type: "enter" } | { type: "flag" } | { type: "escape" };

export type KeyLike = { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null };

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function quizKeyAction(e: KeyLike, optionCount: number): QuizKeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const tag = e.target?.tagName?.toUpperCase();
  if ((tag && TYPING_TAGS.has(tag)) || e.target?.isContentEditable) return null;
  const k = e.key;
  if (k === "Enter") return { type: "enter" };
  if (k === "Escape") return { type: "escape" };
  if (k === "f" || k === "F") return { type: "flag" };
  const digit = /^[1-9]$/.test(k) ? Number(k) - 1 : -1;
  const letter = /^[a-zA-Z]$/.test(k) ? k.toLowerCase().charCodeAt(0) - 97 : -1;
  const index = digit >= 0 ? digit : letter;
  if (index >= 0 && index < optionCount) return { type: "pick", index };
  return null;
}

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export const letterOf = (index: number) => OPTION_LETTERS[index] ?? String(index + 1);

/** Platzhalter {x} in Texten aus lib/i18n.tsx ersetzen. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}
