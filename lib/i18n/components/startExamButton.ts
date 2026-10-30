// Texte von components/StartExamButton.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    failedToStartExam: "Fehler beim Starten der Prüfung.",
    creatingExam: "Prüfung wird erstellt...",
    startExam: "Prüfung starten",
  },
  en: {
    failedToStartExam: "Failed to start exam.",
    creatingExam: "Creating exam...",
    startExam: "Start exam",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_startExamButton(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
