// Texte von components/lesson/ContentLanguageSwitch.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    english: "Deutsch",
  },
  en: {
    english: "English",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_lessonContentLanguageSwitch(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
