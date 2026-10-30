// Texte von components/DomainActivityTrends.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    trendPerDomain30Days: "Trend je Domain (30 Tage)",
    activeDays: "aktive Tage",
  },
  en: {
    trendPerDomain30Days: "Trend per domain (30 days)",
    activeDays: "active days",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_domainActivityTrends(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
