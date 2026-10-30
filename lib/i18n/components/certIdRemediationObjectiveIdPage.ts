// Texte von app/cert/[id]/remediation/[objectiveId]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
    signIn: "Anmelden",
    couldNotLoadRemediation: "Remediation konnte nicht geladen werden.",
    backToCertification: "Zurück zur Zertifizierung",
    review: "Wiederholung: ",
  },
  en: {
    pleaseSignIn: "Please sign in.",
    signIn: "Sign in",
    couldNotLoadRemediation: "Could not load remediation.",
    backToCertification: "Back to certification",
    review: "Review: ",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdRemediationObjectiveIdPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
