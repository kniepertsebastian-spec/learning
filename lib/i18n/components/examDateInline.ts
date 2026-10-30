// Texte von components/ExamDateInline.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    saveFailed: "Speichern fehlgeschlagen.",
    examDate: "Prüfungstermin",
    save: "Speichern",
    cancel: "Abbrechen",
    notSetYet: "noch keiner gesetzt",
    change: "Ändern",
    setADate: "Termin setzen",
  },
  en: {
    saveFailed: "Save failed.",
    examDate: "Exam date",
    save: "Save",
    cancel: "Cancel",
    notSetYet: "not set yet",
    change: "Change",
    setADate: "Set a date",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_examDateInline(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
