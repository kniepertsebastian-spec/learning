// Texte von app/admin/reviewers/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    expertReviewers: "Fachliche Prüfer",
    trialReviewAndClearance: "Probe-Review und Freischaltung",
  },
  en: {
    expertReviewers: "Expert reviewers",
    trialReviewAndClearance: "Trial review and clearance",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminReviewersPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
