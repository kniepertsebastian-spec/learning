// Texte von app/cert/[id]/history/[attemptId]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
    backToMyExams: "Zurück zu meinen Prüfungen",
    noPreviousAttemptToCompare: "Kein vorheriger Versuch zum Vergleich.",
    vsPreviousAttempt: "vs. voriger Versuch",
    byDomain: "Nach Domain",
    weakAreas: "Schwache Bereiche",
    repeatedlyWeak: "wiederholt schwach",
    practiceThisNow: "Gezielt üben →",
    recommendations: "Empfehlungen",
    studyToday: "Heute lernen",
    backToCertification: "Zurück zur Zertifizierung",
    n0Min: "{0} Min.",
  },
  en: {
    pleaseSignIn: "Please sign in.",
    backToMyExams: "Back to my exams",
    noPreviousAttemptToCompare: "No previous attempt to compare.",
    vsPreviousAttempt: "vs. previous attempt",
    byDomain: "By domain",
    weakAreas: "Weak areas",
    repeatedlyWeak: "repeatedly weak",
    practiceThisNow: "Practice this now →",
    recommendations: "Recommendations",
    studyToday: "Study today",
    backToCertification: "Back to certification",
    n0Min: "{0} min",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdHistoryAttemptIdPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
