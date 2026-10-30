// Texte von components/ExamSession.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    failedToSubmitExam: "Fehler beim Einreichen der Prüfung.",
  },
  en: {
    failedToSubmitExam: "Failed to submit exam.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_examSession(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
