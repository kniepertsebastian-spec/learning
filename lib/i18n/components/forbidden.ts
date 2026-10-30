// Texte von app/forbidden.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    youDonTHaveAccess: "Auf diesen Bereich hast du keinen Zugriff.",
    backToHome: "Zur Startseite",
  },
  en: {
    youDonTHaveAccess: "You don't have access to this area.",
    backToHome: "Back to home",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_forbidden(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
