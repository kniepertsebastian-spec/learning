// Texte von components/OfflineHome.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    lockedPleaseCheckOnline: "gesperrt, bitte online prüfen",
    oldestResultNotUploaded: "Ältestes unübertragenes Ergebnis",
  },
  en: {
    lockedPleaseCheckOnline: "locked, please check online",
    oldestResultNotUploaded: "Oldest result not uploaded",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_offlineHome(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
