// Texte von components/ReactivationToggle.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    friendlyNudgeAfterABreak: "Freundliche Erinnerung nach einer Pause",
    aShortEmailAfter5: "Nach 5, 12 und 26 Tagen ohne Lernen eine kurze Mail, höchstens dreimal, ohne Zähler. Nie an Arbeitgeber oder Mentor.",
    thatDidNotWork: "Das hat nicht geklappt.",
  },
  en: {
    friendlyNudgeAfterABreak: "Friendly nudge after a break",
    aShortEmailAfter5: "A short email after 5, 12 and 26 days without studying, at most three times, no counters. Never to employer or mentor.",
    thatDidNotWork: "That did not work.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reactivationToggle(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
