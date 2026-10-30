// Texte von components/StudyGoalPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    studyGoalSaved: "Lernziel gespeichert.",
    saveFailed: "Speichern fehlgeschlagen.",
    studyGoal: "Lernziel",
    examDateOptional: "Prüfungstermin (optional)",
    dailyGoal: "Tagesziel",
    minutesDay: "Minuten/Tag",
    questionsDay: "Fragen/Tag",
    preferredContentLanguage: "Bevorzugte Inhaltssprache",
    noPreference: "Keine Präferenz",
    activeStudyDays: "Aktive Lerntage",
    lightDaysFewerReviews: "Leichte Tage (weniger Wiederholungen)",
    noEstimatePossibleWithThis: "Mit diesem Termin und diesen Lerntagen ist keine Rechnung möglich. Wähle einen Termin in der Zukunft und mindestens einen Lerntag.",
    youHaveEnoughTime: "Die Zeit reicht.",
    itWillBeTight: "Es wird knapp.",
    thisIsNotEnoughTime: "So reicht die Zeit nicht.",
    thisIsARoughEstimate: "Das ist eine grobe Schätzung. Der Termin darf sich verschieben, du kannst das Ziel jederzeit anpassen.",
    saveStudyGoal: "Lernziel speichern",
    untilTheExamYouHave: "Bis zum Termin hast du {0} Lerntage mit je {1} Minuten, zusammen {2} Minuten. Geschätzt fehlen dir noch {3} Minuten (Lektionen lesen und neue Fragen üben, ohne spätere Wiederholungen).",
    planWith0MinDay: "Mit {0} Min./Tag planen",
  },
  en: {
    studyGoalSaved: "Study goal saved.",
    saveFailed: "Save failed.",
    studyGoal: "Study goal",
    examDateOptional: "Exam date (optional)",
    dailyGoal: "Daily goal",
    minutesDay: "minutes/day",
    questionsDay: "questions/day",
    preferredContentLanguage: "Preferred content language",
    noPreference: "No preference",
    activeStudyDays: "Active study days",
    lightDaysFewerReviews: "Light days (fewer reviews)",
    noEstimatePossibleWithThis: "No estimate possible with this date and these study days. Choose a future date and at least one study day.",
    youHaveEnoughTime: "You have enough time.",
    itWillBeTight: "It will be tight.",
    thisIsNotEnoughTime: "This is not enough time.",
    thisIsARoughEstimate: "This is a rough estimate. The date may shift, you can adjust the goal at any time.",
    saveStudyGoal: "Save study goal",
    untilTheExamYouHave: "Until the exam you have {0} study days of {1} minutes each, {2} minutes in total. You still need an estimated {3} minutes (reading lessons and practising new questions, without later reviews).",
    planWith0MinDay: "Plan with {0} min/day",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_studyGoalPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
