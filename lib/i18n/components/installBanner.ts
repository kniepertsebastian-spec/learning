// Texte von components/InstallBanner.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    installTheApp: "App installieren",
    installKnowviaAsAnApp: "Knowvia als App installieren",
    startFasterStudyOfflineAnd: "Schneller starten, offline lernen und Ergebnisse im Hintergrund übertragen.",
    tapShare: "Tippe unten in Safari auf „Teilen“ ",
    chooseAddToHomeScreen: "Wähle „Zum Home-Bildschirm“ ",
    install: "Installieren",
    notNow30Days: "Nicht jetzt (30 Tage Ruhe)",
    notNow: "Nicht jetzt",
  },
  en: {
    installTheApp: "Install the app",
    installKnowviaAsAnApp: "Install Knowvia as an app",
    startFasterStudyOfflineAnd: "Start faster, study offline and upload results in the background.",
    tapShare: "Tap “Share” ",
    chooseAddToHomeScreen: "Choose “Add to Home Screen” ",
    install: "Install",
    notNow30Days: "Not now (30 days)",
    notNow: "Not now",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_installBanner(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
