// Texte von app/cert/[id]/weaknesses/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pleaseSignIn: "Bitte melde dich an, um deine Schwachstellen zu sehen.",
    signIn: "Anmelden",
    backToCertification: "Zurück zum Lernpfad",
    title: "Meine Schwachstellen",
    intro: "Themen, bei denen deine letzte Antwort in den „Sitzt das?“-Quizzes falsch war. Ein Klick startet eine gezielte Übung zum Thema.",
    wrongOf: "{0} von {1} Fragen zuletzt falsch beantwortet",
    practice: "Gezielt üben",
    emptyTitle: "Keine Schwachstellen erkannt",
    emptyText: "Deine letzten Antworten aus den Quizzes waren richtig. Schwächen erscheinen hier, sobald eine Frage zuletzt falsch war.",
    noDataTitle: "Noch keine Quiz-Antworten",
    noDataText: "Die Schwachstellen entstehen aus den „Sitzt das?“-Quizzes am Ende eines Kapitels. Mach ein Quiz, dann siehst du hier, wo es noch hakt.",
    hint: "Zählt je Frage nur die letzte Antwort: Wer eine früher falsche Frage inzwischen richtig hat, gilt dort nicht mehr als schwach.",
    listLabel: "Themen mit Schwachstellen",
  },
  en: {
    pleaseSignIn: "Please sign in to see your weak spots.",
    signIn: "Sign in",
    backToCertification: "Back to learning path",
    title: "My weak spots",
    intro: "Topics where your latest answer in the “Does it stick?” quizzes was wrong. One click starts a targeted practice on the topic.",
    wrongOf: "{0} of {1} questions last answered wrong",
    practice: "Practice this",
    emptyTitle: "No weak spots found",
    emptyText: "Your latest quiz answers were correct. Weak spots show up here as soon as a question was last answered wrong.",
    noDataTitle: "No quiz answers yet",
    noDataText: "Weak spots come from the “Does it stick?” quizzes at the end of a chapter. Take a quiz and you will see here where it still falters.",
    hint: "Only the latest answer per question counts: a question you got wrong earlier but right since no longer counts as weak.",
    listLabel: "Topics with weak spots",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdWeaknessesPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
