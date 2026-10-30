// Texte von app/cert/[id]/session/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
  },
  en: {
    pleaseSignIn: "Please sign in.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdSessionPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
