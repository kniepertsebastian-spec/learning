// Texte von components/ExamResultPrompt.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    examResult: "Prüfungsergebnis",
    yourResultHelpsUsImprove: "Dein Ergebnis hilft uns, die Lernplanung zu verbessern.",
    passed: "Bestanden",
    notPassed: "Nicht bestanden",
    notYet: "Noch nicht",
    couldNotSave: "Speichern fehlgeschlagen.",
    howDidYour0Exam: "Wie lief deine Prüfung „{0}“?",
  },
  en: {
    examResult: "Exam result",
    yourResultHelpsUsImprove: "Your result helps us improve the study planning.",
    passed: "Passed",
    notPassed: "Not passed",
    notYet: "Not yet",
    couldNotSave: "Could not save.",
    howDidYour0Exam: "How did your “{0}” exam go?",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_examResultPrompt(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
