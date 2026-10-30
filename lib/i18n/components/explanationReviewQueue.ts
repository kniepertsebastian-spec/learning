// Texte von components/ExplanationReviewQueue.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    alternativeExplanationsUnderstandingMode: "Alternativerklärungen (Verstehens-Modus)",
    loading: "Lädt …",
    noDraftsToReview: "Keine Entwürfe zur Prüfung.",
    solutionForTheGaps: "Lösung zu den Lücken",
    editText: "Text bearbeiten",
    english: "Deutsch",
    solutionEnglish: "Lösung Deutsch",
    approve: "Freigeben",
    reject: "Verwerfen",
    n0Approved1Drafts2: "{0} freigegeben, {1} Entwürfe, {2} verworfen.",
  },
  en: {
    alternativeExplanationsUnderstandingMode: "Alternative explanations (understanding mode)",
    loading: "Loading …",
    noDraftsToReview: "No drafts to review.",
    solutionForTheGaps: "Solution for the gaps",
    editText: "Edit text",
    english: "English",
    solutionEnglish: "Solution English",
    approve: "Approve",
    reject: "Reject",
    n0Approved1Drafts2: "{0} approved, {1} drafts, {2} rejected.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_explanationReviewQueue(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
