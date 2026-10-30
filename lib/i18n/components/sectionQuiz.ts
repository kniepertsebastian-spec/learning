// Texte von components/SectionQuiz.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    sectionQuiz: "Abschnittsquiz",
  },
  en: {
    sectionQuiz: "Section quiz",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_sectionQuiz(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
