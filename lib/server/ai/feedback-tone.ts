/**
 * Leitfaden für Rückmeldungen nach Fehlern (docs/RUECKMELDUNGEN.md), als Baustein für alle Prompts, die Erklärungen oder Begründungen
 * erzeugen: Fehler sind ein fehlender Schritt, nie eine Eigenschaft der Person.
 */
export const FEEDBACK_TONE_PROMPT =
  'Ton bei Fehlern: Beschreibe, was an der Auswahl fehlt oder woher sie kommt (z. B. "Hier fehlt noch der Zwischenschritt …", "Das passt zu …, gilt aber nicht, wenn …"). Wertende Wörter über die Person oder ihre Antwort ("falsch gemacht", "leider", "versagt", "unfähig") und Zahlen ohne Quelle ("die meisten scheitern hier") kommen nicht vor.';
