// Texte von app/experts/[slug]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    expertReviewer: "Fachlicher Prüfer",
    expertReviewer0: "Fachlicher Prüfer · {0}",
  },
  en: {
    expertReviewer: "Expert reviewer",
    expertReviewer0: "Expert reviewer · {0}",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_expertsSlugPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
