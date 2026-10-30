// Texte von app/admin/reviewers/probe/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    expertReviewers: "Fachliche Prüfer",
    trialReview: "Probe-Review",
  },
  en: {
    expertReviewers: "Expert reviewers",
    trialReview: "Trial review",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminReviewersProbePage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
