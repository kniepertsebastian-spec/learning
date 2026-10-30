// Texte von components/CheatSheetDone.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    doneReading: "Durchgesehen",
    savedCountsAsAStudy: "Gespeichert: zählt als Lerntag für dein Wochenziel.",
    thatDidNotWork: "Das hat nicht geklappt.",
    countsAsActivityForYour: "Zählt als Aktivität für dein Wochenziel, nicht als Wiederholung.",
  },
  en: {
    doneReading: "Done reading",
    savedCountsAsAStudy: "Saved: counts as a study day for your weekly goal.",
    thatDidNotWork: "That did not work.",
    countsAsActivityForYour: "Counts as activity for your weekly goal, not as a review.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_cheatSheetDone(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
