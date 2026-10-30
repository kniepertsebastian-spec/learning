// Texte von components/StudySession.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    todaySSession: "Tages-Session",
    failedToSubmit: "Einreichen fehlgeschlagen.",
    handsOnTask: "Praxisaufgabe",
    fromTheLesson: "Aus der Lektion ",
    applyWhatYouVeLearned: ": wende das Gelernte selbst an.",
  },
  en: {
    thatDidNotWork: "That did not work.",
    todaySSession: "Today's session",
    failedToSubmit: "Failed to submit.",
    handsOnTask: "Hands-on task",
    fromTheLesson: "From the lesson ",
    applyWhatYouVeLearned: ": apply what you've learned.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_studySession(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
