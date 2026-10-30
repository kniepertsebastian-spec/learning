// Texte von app/cert/[id]/final-exam/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
    signIn: "Anmelden",
    backToCertification: "Zurück zur Zertifizierung",
    finalPracticeExam: "Abschlussprüfung",
    questionsDistributedByOfficialDomain: "Fragen verteilt nach offizieller Domain-Gewichtung (Fragenanzahl der echten Prüfung noch nicht hinterlegt)",
    avoidsQuestionsYouVeAlready: "Vermeidet Fragen, die du bereits in Quizzes beantwortet hast",
    atTheEndAnAssessment: "Am Ende: eine Einschätzung, wie gut du vorbereitet bist",
    n0QuestionsDistributedByOfficial: "{0} Fragen, verteilt nach offizieller Domain-Gewichtung",
    timeLimit0MinutesMatching: "Zeitlimit: {0} Minuten, wie in der echten Prüfung",
  },
  en: {
    pleaseSignIn: "Please sign in.",
    signIn: "Sign in",
    backToCertification: "Back to certification",
    finalPracticeExam: "Final Practice Exam",
    questionsDistributedByOfficialDomain: "Questions distributed by official domain weighting (real exam question count not on file yet)",
    avoidsQuestionsYouVeAlready: "Avoids questions you've already answered in quizzes",
    atTheEndAnAssessment: "At the end: an assessment of how well prepared you are",
    n0QuestionsDistributedByOfficial: "{0} questions distributed by official domain weighting",
    timeLimit0MinutesMatching: "Time limit: {0} minutes, matching the real exam",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdFinalExamPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
