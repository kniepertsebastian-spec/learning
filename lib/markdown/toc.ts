/** H2-Überschriften eines Markdown-Textes für „Auf dieser Seite“ (ohne Überschriften in Codeblöcken). */
export type TocEntry = { id: string; text: string };

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "abschnitt"
  );
}

export function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/[`*_]/g, "").trim();
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ id: n === 0 ? base : `${base}-${n + 1}`, text });
  }
  return out;
}

/** Hat die Lektion Hands-on-Anteile (Praxisbeispiel oder Terminal-Block)? */
export function isHandsOn(markdown: string): boolean {
  return /^:{3,}\s*practice\b/m.test(markdown) || /^\s*```+\s*(console|terminal)\b/m.test(markdown);
}

/** Lesezeit grob aus der Wortzahl (ca. 200 Wörter/Minute), mindestens 1. */
export function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
