// Texte von app/cert/[id]/chapter/[domainId]/quiz/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    doesItStick: "Sitzt das?",
    thereAreNoQuestionsFor: "Für dieses Kapitel gibt es noch keine Fragen.",
    backToTheCourse: "Zurück zum Kurs",
    drawNewQuestions: "Neue Fragen ziehen",
    youHaveWorkedThrough0: "Du hast {0} von {1} Lektionen dieses Kapitels durchgearbeitet. Das Quiz geht trotzdem, abgeschlossen ist das Kapitel aber erst mit allen Lektionen und bestandenem Quiz.",
  },
  en: {
    doesItStick: "Does it stick?",
    thereAreNoQuestionsFor: "There are no questions for this chapter yet.",
    backToTheCourse: "Back to the course",
    drawNewQuestions: "Draw new questions",
    youHaveWorkedThrough0: "You have worked through {0} of {1} lessons in this chapter. You can take the quiz anyway, but the chapter only counts as completed with all lessons done and the quiz passed.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdChapterDomainIdQuizPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
