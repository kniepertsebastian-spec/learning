// Texte von components/CompanyModulesSection.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    yourCompanySMaterialFor: "Unterlagen deiner Firma zu diesem Lernpfad.",
    owner: "Verantwortlich",
    thisMaterialHasExpiredAnd: "Diese Unterlage ist abgelaufen und wird von der verantwortlichen Person überarbeitet. Bitte frage dort nach.",
    from0: "Von {0}",
  },
  en: {
    yourCompanySMaterialFor: "Your company's material for this learning path.",
    owner: "Owner",
    thisMaterialHasExpiredAnd: "This material has expired and is being revised by the person responsible. Please ask them.",
    from0: "From {0}",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_companyModulesSection(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
