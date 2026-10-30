// Texte von app/cert/[id]/history/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an.",
    backToCertification: "Zurück zur Zertifizierung",
    myExams: "Meine Prüfungen",
    noPracticeExamCompletedYet: "Noch keine Abschlussprüfung absolviert.",
    date: "Datum",
    result: "Ergebnis",
    duration: "Dauer",
    notCompleted: "nicht abgeschlossen",
    n0Min: "{0} Min.",
  },
  en: {
    pleaseSignIn: "Please sign in.",
    backToCertification: "Back to certification",
    myExams: "My exams",
    noPracticeExamCompletedYet: "No practice exam completed yet.",
    date: "Date",
    result: "Result",
    duration: "Duration",
    notCompleted: "not completed",
    n0Min: "{0} min",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdHistoryPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
