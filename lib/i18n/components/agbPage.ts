// Texte von app/agb/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    termsOfService: "AGB / Service Agreements",
    conditionsOfUse: "Bedingungen für die Nutzung der Plattform.",
    draftNotice: "Entwurf: Die Freigabe der Bedingungen durch den Betreiber steht noch aus.",
    toPrivacyPolicy: "Zur Datenschutzerklärung",
  },
  en: {
    termsOfService: "Terms of service",
    conditionsOfUse: "Terms for using the platform.",
    draftNotice: "Draft: the operator has not yet approved these terms.",
    toPrivacyPolicy: "Go to the privacy policy",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_agbPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
