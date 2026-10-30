// Texte von components/PrerequisiteReviewQueue.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    conceptPrerequisites: "Voraussetzungen zwischen Konzepten",
    loading: "Lädt …",
    noProposalsToReview: "Keine Vorschläge zur Prüfung.",
    requires: " setzt voraus: ",
    approve: "Freigeben",
    reject: "Verwerfen",
    n0Approved1Proposals2: "{0} freigegeben, {1} Vorschläge, {2} verworfen.",
  },
  en: {
    conceptPrerequisites: "Concept prerequisites",
    loading: "Loading …",
    noProposalsToReview: "No proposals to review.",
    requires: " requires: ",
    approve: "Approve",
    reject: "Reject",
    n0Approved1Proposals2: "{0} approved, {1} proposals, {2} rejected.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_prerequisiteReviewQueue(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
