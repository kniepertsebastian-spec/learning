// Texte von components/quiz/FormatQuestionCard.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    checkAnswer: "Antwort prüfen",
  },
  en: {
    checkAnswer: "Check answer",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_quizFormatQuestionCard(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
