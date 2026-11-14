// Texte von components/SelfReportSettings.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    questionsForYou: "Kurze Fragen an dich",
    intro: "Ab und zu fragt die App etwas, das sich aus deinem Lernen nicht ablesen lässt. Jede Frage ist freiwillig und lässt sich überspringen. Höchstens eine Frage je Lernsitzung. Wer eine Frage dreimal überspringt, sieht sie 30 Tage nicht.",
    pausedUntil0: "Pausiert bis {0}, weil du sie dreimal übersprungen hast.",
    thatDidNotWork: "Das hat nicht geklappt. Bitte versuch es noch einmal.",
    kinds: {
      effort: { label: "Anstrengung", hint: "Nach einer Lektion: Wie anstrengend war das?" },
      retention_forecast: { label: "Was bleibt hängen", hint: "Nach einer Lektion: Wie viel davon weißt du in einer Woche noch?" },
      exam_confidence: { label: "Zuversicht für die Prüfung", hint: "Wöchentlich, wenn du einen Prüfungstermin gesetzt hast." },
      learning_reason: { label: "Grund fürs Lernen", hint: "Einmal je Kurs: Pflicht, Stelle, Wechsel oder Interesse." },
      work_relevance: { label: "Nutzen für die Arbeit", hint: "Selten nach einer Lektion: Brauchst du das in deiner Arbeit?" },
      learning_environment: { label: "Lernumgebung", hint: "Im Check-in: ruhig, unterwegs oder bei der Arbeit." },
    },
  },
  en: {
    questionsForYou: "Short questions for you",
    intro: "Now and then the app asks something your learning does not show by itself. Every question is optional and can be skipped. At most one question per study session. Skip a question three times and you will not see it for 30 days.",
    pausedUntil0: "Paused until {0} because you skipped it three times.",
    thatDidNotWork: "That did not work. Please try again.",
    kinds: {
      effort: { label: "Effort", hint: "After a lesson: how demanding was that?" },
      retention_forecast: { label: "What sticks", hint: "After a lesson: how much of it will you still know in a week?" },
      exam_confidence: { label: "Exam confidence", hint: "Weekly, once you have set an exam date." },
      learning_reason: { label: "Reason for learning", hint: "Once per course: required, job, career change or interest." },
      work_relevance: { label: "Use at work", hint: "Rarely after a lesson: do you need this at work?" },
      learning_environment: { label: "Learning environment", hint: "In the check-in: quiet, on the go or at work." },
    },
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_selfReportSettings(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
