// Texte von components/CourseSources.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    sourcesFurtherReading: "Quellen & Fachliteratur",
    version: "Version",
  },
  en: {
    sourcesFurtherReading: "Sources & further reading",
    version: "Version",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_courseSources(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
