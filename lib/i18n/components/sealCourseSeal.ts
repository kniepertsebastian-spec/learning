// Texte von components/seal/CourseSeal.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    expertReviewed: "Fachlich geprüft",
    version: "Version",
    asOf: "Stand",
    and: " und ",
    thisCourseWasTechnicallyReviewed: "Dieser Kurs wurde fachlich von ",
    text: " geprüft.",
    field: "Fachgebiet",
    viewExpertProfile: "Zum Expertenprofil",
    theReviewAppliesToThe: "Die Prüfung gilt für den oben genannten Stand; die Änderungen sind noch nicht erneut geprüft.",
    whatDoesReviewedMean: "Was bedeutet „geprüft“?",
    moreInTheTermsOf: "Weiteres steht in den AGB.",
  },
  en: {
    expertReviewed: "Expert reviewed",
    version: "Version",
    asOf: "as of",
    and: " and ",
    thisCourseWasTechnicallyReviewed: "This course was technically reviewed by ",
    text: ".",
    field: "Field",
    viewExpertProfile: "View expert profile",
    theReviewAppliesToThe: "The review applies to the date above; the changes have not been reviewed again yet.",
    whatDoesReviewedMean: "What does “reviewed” mean?",
    moreInTheTermsOf: "More in the terms of service.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_sealCourseSeal(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
