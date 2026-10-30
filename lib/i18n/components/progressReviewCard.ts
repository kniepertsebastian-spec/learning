// Texte von components/ProgressReviewCard.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    yourProgress: "Dein Fortschritt",
    secureObjectivesOverTime: "Sichere Lernziele über die Zeit",
    youHaveAlreadyReachedYour: "Du hast dein Ziel an sicheren Lernzielen für den Prüfungstermin schon erreicht.",
    raiseWeeklyGoal: "Wochenziel erhöhen",
    changeExamDate: "Termin ändern",
    visibleToYouOnlyNo: "Nur für dich sichtbar, ohne Vergleich mit anderen.",
    n0WeeksAgo1Of: "Vor {0} Wochen: {1} von {2} Lernzielen sicher. Heute: {3}.",
    youAreOnTrackAt: "Du bist auf Kurs: Bei deinem Tempo erwarten wir bis zum Prüfungstermin etwa {0} sichere Lernziele (Ziel: {1}).",
    atYourPaceItWill: "Bei deinem Tempo wird es bis zum Prüfungstermin knapp: etwa {0} sichere Lernziele erwartet, Ziel {1}. Sollen wir den Plan anpassen?",
  },
  en: {
    yourProgress: "Your progress",
    secureObjectivesOverTime: "Secure objectives over time",
    youHaveAlreadyReachedYour: "You have already reached your goal of secure objectives for the exam date.",
    raiseWeeklyGoal: "Raise weekly goal",
    changeExamDate: "Change exam date",
    visibleToYouOnlyNo: "Visible to you only, no comparison with others.",
    n0WeeksAgo1Of: "{0} weeks ago: {1} of {2} objectives secure. Today: {3}.",
    youAreOnTrackAt: "You are on track: at your pace we expect about {0} secure objectives by the exam date (goal: {1}).",
    atYourPaceItWill: "At your pace it will be tight by the exam date: about {0} secure objectives expected, goal {1}. Shall we adjust the plan?",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_progressReviewCard(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
