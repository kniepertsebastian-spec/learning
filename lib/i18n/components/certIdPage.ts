// Texte von app/cert/[id]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    noLearningContentYet: "Noch keine Lerninhalte",
    learningContentHasNotBeen: "Für diesen Kurs wurden noch keine Lerninhalte erzeugt.",
    adminShowsTheContentStatus: "Im Adminbereich siehst du den Content-Status. Danach müssen Curriculum und Lektionen einmalig im App-Container erzeugt werden.",
    openAdmin: "Zum Adminbereich",
    thisLearningPathHasNo: "Dieser Lernpfad hat keine Tests: Er gilt als abgeschlossen, sobald du alle Lektionen durchgearbeitet hast.",
    yourEntryAssessment0Of: "Dein Einstufungstest: {0} von {1} richtig",
    n0Of1LessonsCompleted: "{0} von {1} Lektionen durchgearbeitet",
  },
  en: {
    noLearningContentYet: "No learning content yet",
    learningContentHasNotBeen: "Learning content has not been generated for this course yet.",
    adminShowsTheContentStatus: "Admin shows the content status. The curriculum and lessons then need to be generated once in the app container.",
    openAdmin: "Open admin",
    thisLearningPathHasNo: "This learning path has no tests: it counts as completed once you have worked through all lessons.",
    yourEntryAssessment0Of: "Your entry assessment: {0} of {1} correct",
    n0Of1LessonsCompleted: "{0} of {1} lessons completed",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
