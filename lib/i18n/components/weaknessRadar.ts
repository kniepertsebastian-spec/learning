// Texte von components/WeaknessRadar.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    weaknessRadar: "Schwächen-Radar",
    noWeakSpotsFoundYour: "Keine Schwachstellen erkannt: Deine letzten Antworten aus den Quizzes waren richtig.",
    worthReviewing: "Hier lohnt sich Nachbereitung",
    fromYourDoesItStick: "Aus deinen „Sitzt das?“-Quizzes. Zählt je Frage die letzte Antwort.",
    n0Of1QuestionsLast: "{0} von {1} Fragen zuletzt falsch beantwortet",
  },
  en: {
    weaknessRadar: "Weakness radar",
    noWeakSpotsFoundYour: "No weak spots found: your latest quiz answers were correct.",
    worthReviewing: "Worth reviewing",
    fromYourDoesItStick: "From your “Does it stick?” quizzes. Counts the latest answer per question.",
    n0Of1QuestionsLast: "{0} of {1} questions last answered wrong",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_weaknessRadar(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
