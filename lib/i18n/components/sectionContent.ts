// Texte von components/SectionContent.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    whyAmILearningThis: "Warum lerne ich das?",
    inYourCompanySTraining: "Im Ausbildungsrahmenplan deiner Firma: ",
    itIsPartOfYour: "Er gehört zu deinen Karrierepfaden: ",
    practiceTaskUnlocked: "Praxisaufgabe freigeschaltet: ",
    the0DomainMakesUp: "Der Bereich „{0}“ macht etwa {1} % der Prüfung aus.",
  },
  en: {
    whyAmILearningThis: "Why am I learning this?",
    inYourCompanySTraining: "In your company's training framework: ",
    itIsPartOfYour: "It is part of your career paths: ",
    practiceTaskUnlocked: "Practice task unlocked: ",
    the0DomainMakesUp: "The “{0}” domain makes up about {1}% of the exam.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_sectionContent(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
