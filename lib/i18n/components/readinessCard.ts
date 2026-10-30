// Texte von components/ReadinessCard.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    highConfidence: "hohe Sicherheit",
    mediumConfidence: "mittlere Sicherheit",
    lowConfidence: "niedrige Sicherheit",
    examReadiness: "Prüfungsreife",
    keepPracticingAReliableEstimate: "Übe weiter - eine verlässliche Einschätzung braucht mehr Daten (mehrere Objectives, wiederholte Übung, idealerweise eine Probeprüfung).",
    whyThisEstimate: "Warum diese Einschätzung?",
    objectiveCoverage: "Abgedeckte Objectives",
    avgMasteryOfPracticedObjectives: "Ø Mastery der geübten Objectives",
    practiceRecency: "Aktualität der Übung",
    recentMockExamTrend: "Trend der letzten Probeprüfungen",
    noneTakenYet: "noch keine absolviert",
  },
  en: {
    highConfidence: "high confidence",
    mediumConfidence: "medium confidence",
    lowConfidence: "low confidence",
    examReadiness: "Exam readiness",
    keepPracticingAReliableEstimate: "Keep practicing - a reliable estimate needs more data (several objectives, repeated practice, ideally a mock exam).",
    whyThisEstimate: "Why this estimate?",
    objectiveCoverage: "Objective coverage",
    avgMasteryOfPracticedObjectives: "Avg. mastery of practiced objectives",
    practiceRecency: "Practice recency",
    recentMockExamTrend: "Recent mock exam trend",
    noneTakenYet: "none taken yet",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_readinessCard(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
