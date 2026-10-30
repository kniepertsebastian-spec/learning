// Texte von components/quiz/FeedbackPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    explainInOneSentenceWhy: "Erkläre in einem Satz, warum die richtige Antwort passt.",
  },
  en: {
    explainInOneSentenceWhy: "Explain in one sentence why the correct answer fits.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_quizFeedbackPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
