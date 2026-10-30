// Texte von app/agb/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    termsOfService: "AGB / Service Agreements",
    excerptStatementsOnReviewPassing: "Auszug: Aussagen zu Prüfung, Bestehen und Prüfungsbedingungen.",
  },
  en: {
    termsOfService: "Terms of service",
    excerptStatementsOnReviewPassing: "Excerpt: statements on review, passing and exam conditions.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_agbPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
