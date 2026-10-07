/**
 * Erkennt, ob eine Quelle überwiegend eine Stichwortliste oder Gliederung ist (kurze Zeilen, kaum ausformulierte
 * Sätze). Dann leitet die KI Lernziele aus den Stichwörtern ab und ergänzt die Erklärungen aus Fachwissen, statt
 * nur aus dem Text zu schöpfen. Reine Heuristik ohne KI; sie entscheidet nur über den Prompt, nie über Freigaben.
 * Listen MIT Aussagen („Tickets mit Priorität 1 werden binnen 1 Stunde bearbeitet“) zählen nicht als Stichwortliste.
 */

/** Ab so vielen Wörtern gilt eine Zeile als ausformulierter Satz (Aufzählungszeichen und Überschriften zählen nicht mit). */
const SENTENCE_MIN_WORDS = 7;
/** Höchstens so viel Anteil ausformulierter Zeilen, damit die Quelle noch als Stichwortliste gilt. */
const MAX_SENTENCE_SHARE = 0.2;
const MIN_LINES = 3;

export function looksLikeOutline(texts: string[]): boolean {
  const lines = texts
    .flatMap((t) => t.split(/\r?\n/))
    .map((l) => l.replace(/^\s*(?:#{1,6}\s+|[-*+•·–]\s+|\d+[.)]\s+)/, "").trim())
    .filter((l) => l.length > 0 && !/^(?:```|---|===|\|?\s*:?-{3,})/.test(l));
  if (lines.length < MIN_LINES) return false;
  const sentences = lines.filter((l) => l.split(/\s+/).length >= SENTENCE_MIN_WORDS).length;
  return sentences / lines.length <= MAX_SENTENCE_SHARE;
}
