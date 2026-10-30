// Texte von components/AgeRangeSelect.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    ageRangeOptional: "Altersspanne (optional)",
    onlyUsedForTheStarting: "Wird nur für die Startwerte der Wiederholungsplanung genutzt.",
    preferNotToSay: "Keine Angabe",
    thatDidNotWork: "Das hat nicht geklappt.",
  },
  en: {
    ageRangeOptional: "Age range (optional)",
    onlyUsedForTheStarting: "Only used for the starting values of review scheduling.",
    preferNotToSay: "Prefer not to say",
    thatDidNotWork: "That did not work.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_ageRangeSelect(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
