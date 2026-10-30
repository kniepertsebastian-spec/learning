// Texte von components/PreAssessment.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    entryAssessment: "Einstufungstest",
    aOfBCorrect: "{a} von {b} richtig",
    thisIsOnlyASnapshot: "Das ist nur eine Standortbestimmung, sie zählt nicht für deinen Lernstand. Mit den Kapiteln unten kannst du anfangen, wo es am meisten bringt.",
    worthACloserLook: "Hier lohnt sich ein gründlicher Blick: ",
    correct: "Richtig",
    wrong: "Falsch",
    onToTheCourse: "Weiter zum Kurs",
    nQuestionsAcrossAllChapters: "{n} Fragen quer durch alle Kapitel zeigen dir, wo du stehst. Raten ist erlaubt, das Ergebnis zählt nicht für deinen Lernstand.",
    skip: "Überspringen",
    evaluate: "Auswerten",
    thatDidNotWorkPlease: "Das hat nicht geklappt. Bitte versuche es noch einmal.",
  },
  en: {
    entryAssessment: "Entry assessment",
    aOfBCorrect: "{a} of {b} correct",
    thisIsOnlyASnapshot: "This is only a snapshot and does not count towards your progress. Start with the chapters below where it helps most.",
    worthACloserLook: "Worth a closer look: ",
    correct: "Correct",
    wrong: "Wrong",
    onToTheCourse: "On to the course",
    nQuestionsAcrossAllChapters: "{n} questions across all chapters show where you stand. Guessing is fine, the result does not count towards your progress.",
    skip: "Skip",
    evaluate: "Evaluate",
    thatDidNotWorkPlease: "That did not work. Please try again.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_preAssessment(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
