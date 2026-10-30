// Texte von components/quiz/SelfExplanation.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    explainInOneSentenceOptional: "In einem Satz erklären (freiwillig)",
    notGradedAndStaysOn: "Wird nicht bewertet und bleibt nur auf diesem Gerät.",
    compareWithModelAnswer: "Mit Musterantwort vergleichen",
    skip: "Überspringen",
    yourExplanation: "Deine Erklärung",
    modelAnswerForComparison: "Musterantwort zum Vergleich",
  },
  en: {
    explainInOneSentenceOptional: "Explain in one sentence (optional)",
    notGradedAndStaysOn: "Not graded and stays on this device only.",
    compareWithModelAnswer: "Compare with model answer",
    skip: "Skip",
    yourExplanation: "Your explanation",
    modelAnswerForComparison: "Model answer for comparison",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_quizSelfExplanation(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
