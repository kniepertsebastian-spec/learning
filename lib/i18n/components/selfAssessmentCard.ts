// Texte von components/SelfAssessmentCard.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    selfAssessment: "Selbsteinschätzung",
  },
  en: {
    selfAssessment: "Self-assessment",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_selfAssessmentCard(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
