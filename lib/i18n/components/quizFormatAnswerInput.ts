// Texte von components/quiz/FormatAnswerInput.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    putTheStepsInThe: "Bringe die Schritte in die richtige Reihenfolge.",
    moveUp: "Nach oben",
    moveDown: "Nach unten",
    yourAnswerShortEG: "Deine Antwort (kurz, z. B. Befehl, Port oder Begriff)",
    matchEachTermWithThe: "Ordne jedem Begriff die passende Aussage zu.",
    matchFor: "Zuordnung für",
    pleaseChoose: "Bitte wählen …",
    correctWouldBe: "Richtig wäre:",
  },
  en: {
    putTheStepsInThe: "Put the steps in the correct order.",
    moveUp: "Move up",
    moveDown: "Move down",
    yourAnswerShortEG: "Your answer (short, e.g. a command, port or term)",
    matchEachTermWithThe: "Match each term with the fitting statement.",
    matchFor: "Match for",
    pleaseChoose: "Please choose …",
    correctWouldBe: "Correct would be:",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_quizFormatAnswerInput(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
