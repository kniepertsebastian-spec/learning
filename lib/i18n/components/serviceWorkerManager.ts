// Texte von components/ServiceWorkerManager.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    aCourseIsNoLonger: "Ein Kurs ist nicht mehr für dich freigegeben und wurde vom Gerät entfernt.",
  },
  en: {
    aCourseIsNoLonger: "A course is no longer shared with you and was removed from this device.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_serviceWorkerManager(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
