// Texte von components/quiz/FormatFeedbackPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    notQuite: "Noch nicht ganz",
    explainInOneSentenceWhy: "Erkläre in einem Satz, warum das die richtige Lösung ist.",
    n0Right: "· {0} % richtig",
  },
  en: {
    notQuite: "Not quite",
    explainInOneSentenceWhy: "Explain in one sentence why this is the right solution.",
    n0Right: "· {0}% right",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_quizFormatFeedbackPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
