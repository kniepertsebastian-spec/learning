// Texte von app/reviewer/probe/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    myCourse: "Mein Kurs",
    trialReview: "Probe-Review",
  },
  en: {
    myCourse: "My course",
    trialReview: "Trial review",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerProbePage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
