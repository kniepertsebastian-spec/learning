// Texte von app/cert/[id]/offline/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
    backToCertification: "Zurück zur Zertifizierung",
    availableOffline: "Offline verfügbar",
  },
  en: {
    pleaseSignIn: "Please sign in.",
    backToCertification: "Back to certification",
    availableOffline: "Available offline",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdOfflinePage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
