/**
 * Zerlegung eines Fließtexts (HTML nach Tag-Entfernung, Markdown, Text) in Abschnitte mit eigenem Locator.
 * Eigenes Modul, weil sowohl die Kursgenerierung (course-generation/sources.ts) als auch die Quellenverwaltung
 * (admin/source-extraction.ts, Markdown-Quellen) sie brauchen und sich diese beiden Dateien nicht gegenseitig
 * importieren dürfen (course-generation/sources.ts importiert bereits die PDF-Extraktion aus der Quellenverwaltung).
 */

export interface SourceExcerpt {
  /** Seiten-/Abschnittsbezug, z. B. "S. 4" (PDF) oder "Abschnitt 1" (Text/HTML). */
  locator: string;
  text: string;
}

export const SECTION_MIN_CHARS = 800;
export const SECTION_MAX_CHARS = 6_000;

/**
 * Zerlegt einen Fließtext (HTML nach stripHtml, Markdown, Text) in Abschnitte mit eigenem Locator
 * („Abschnitt 3: Backups“). Vorher war jede Text-/HTML-Quelle EIN Ausschnitt „Abschnitt 1“: der Blueprint konnte so
 * keinem Lernziel einen Teil zuordnen, und JEDES Lernziel bekam die ganze Quelle (bis zur Höchstmenge) erneut als
 * Eingabe. Getrennt wird an Überschriften (ab SECTION_MIN_CHARS Zeichen) und, wenn ein Abschnitt zu lang wird, an
 * Absatzgrenzen. Kurze Texte bleiben ein Abschnitt.
 */
export function splitIntoSections(text: string, maxChars = SECTION_MAX_CHARS, minChars = SECTION_MIN_CHARS): SourceExcerpt[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [{ locator: "Abschnitt 1", text: trimmed }];

  const chunks: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; lines: string[]; size: number } = { heading: null, lines: [], size: 0 };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body) chunks.push({ heading: current.heading, text: body });
    current = { heading: null, lines: [], size: 0 };
  };
  const headingOf = (line: string) => /^\s*#{1,6}\s+(\S.*)$/.exec(line)?.[1]?.trim() ?? null;

  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = headingOf(line);
    if (heading && current.size >= minChars) flush();
    // Eine Überschrift benennt den Abschnitt, solange er noch leer ist (auch statt eines „(Forts.)“-Namens).
    if (heading && (current.heading === null || current.lines.length === 0)) current.heading = heading;
    // Zu lang: an der nächsten Leerzeile (Absatzende) trennen; eine einzelne Riesenzeile wird hart geteilt.
    if (current.size >= maxChars && line.trim() === "") {
      const carry = current.heading;
      flush();
      current.heading = carry ? `${carry} (Forts.)` : null;
      continue;
    }
    if (line.length > maxChars) {
      for (let start = 0; start < line.length; start += maxChars) {
        current.lines.push(line.slice(start, start + maxChars));
        current.size += Math.min(maxChars, line.length - start);
        if (current.size >= maxChars) flush();
      }
      continue;
    }
    current.lines.push(line);
    current.size += line.length + 1;
  }
  flush();

  return chunks.map((chunk, index) => ({
    locator: `Abschnitt ${index + 1}${chunk.heading ? `: ${chunk.heading.replace(/[#*`_[\]]/g, "").slice(0, 60).trim()}` : ""}`,
    text: chunk.text,
  }));
}
