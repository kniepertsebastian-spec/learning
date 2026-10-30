// Texte von components/LearningPreferencesForm.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    weeklyGoalStudyDaysPer: "Wochenziel (Lerntage pro Woche)",
    lightDaysFromYourStudy: "Leichte Tage aus deinem Lernplan zählen nicht gegen das Ziel.",
    showStreak: "Serie anzeigen",
    consecutiveStudyDaysWithOne: "Aufeinanderfolgende Lerntage, mit einem freien Tag pro Woche und ohne leichte Tage. Aus, wenn dich Serien eher unter Druck setzen.",
    confidenceRatingOnQuestions: "Sicherheitsangabe bei Fragen",
    fromThe3rdSessionHow: "Ab der 3. Session: „Wie sicher bist du?“ Damit wir Geratenes öfter wiederholen.",
    dailyCheckIn: "Check-in zur Tagesform",
    fromThe5thSessionEnergy: "Ab der 5. Session: Energie und Arbeitstag vor dem Start. Die Planung passt sich damit an deinen Tag an.",
    instantFeedbackAfterEachQuestion: "Sofort-Feedback nach jeder Frage",
    offRightAndWrongOnly: "Aus: Richtig und Falsch erst am Ende, wie in der Prüfung (gilt für dieses Gerät).",
    thinkOfTheAnswerFirst: "Antwort zuerst überlegen",
    onMultipleChoiceQuestionsThe: "Bei Auswahlfragen bleiben die Optionen verdeckt, bis du „Optionen zeigen“ wählst. Eine Lernhilfe ohne Einfluss auf dein Rating (gilt für dieses Gerät).",
    saving: "Speichert …",
    saved: "Gespeichert.",
    thatDidNotWork: "Das hat nicht geklappt.",
  },
  en: {
    weeklyGoalStudyDaysPer: "Weekly goal (study days per week)",
    lightDaysFromYourStudy: "Light days from your study plan do not count against the goal.",
    showStreak: "Show streak",
    consecutiveStudyDaysWithOne: "Consecutive study days, with one free day per week and without light days. Off if streaks put you under pressure.",
    confidenceRatingOnQuestions: "Confidence rating on questions",
    fromThe3rdSessionHow: "From the 3rd session: “How sure are you?” So we repeat guesses more often.",
    dailyCheckIn: "Daily check-in",
    fromThe5thSessionEnergy: "From the 5th session: energy and workday before you start. Planning adapts to your day.",
    instantFeedbackAfterEachQuestion: "Instant feedback after each question",
    offRightAndWrongOnly: "Off: right and wrong only at the end, like in the exam (this device only).",
    thinkOfTheAnswerFirst: "Think of the answer first",
    onMultipleChoiceQuestionsThe: "On multiple-choice questions the options stay hidden until you choose “Show options”. A study aid with no effect on your rating (this device only).",
    saving: "Saving …",
    saved: "Saved.",
    thatDidNotWork: "That did not work.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_learningPreferencesForm(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
