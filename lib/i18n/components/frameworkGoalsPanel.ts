// Texte von components/FrameworkGoalsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    trainingFramework: "Ausbildungsrahmenplan",
    assignYourTrainingFrameworkEntries: "Ordnet Lernzielen eure Einträge aus dem Ausbildungsrahmenplan zu. Wer die Lektion öffnet, sieht unter „Warum lerne ich das?“, welches Ziel eures Plans sie abdeckt.",
    learningPath: "Lernpfad",
    objective: "Lernziel",
    chooseObjective: "Lernziel wählen",
    noEG23: "Nr., z. B. 2.3",
    numberInThePlan: "Nummer im Plan",
    entryInThePlan: "Eintrag im Plan, z. B. „Betriebssysteme installieren“",
    entryInThePlan2: "Eintrag im Plan",
    assign: "Zuordnen",
    thereIsNoLearningPath: "Es gibt noch keinen Lernpfad, dem sich Einträge zuordnen lassen.",
    remove: "Entfernen",
  },
  en: {
    trainingFramework: "Training framework",
    assignYourTrainingFrameworkEntries: "Assign your training framework entries to learning objectives. Learners see under “Why am I learning this?” which goal of your plan a lesson covers.",
    learningPath: "Learning path",
    objective: "Objective",
    chooseObjective: "Choose objective",
    noEG23: "No., e.g. 2.3",
    numberInThePlan: "Number in the plan",
    entryInThePlan: "Entry in the plan",
    entryInThePlan2: "Entry in the plan",
    assign: "Assign",
    thereIsNoLearningPath: "There is no learning path yet.",
    remove: "Remove",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_frameworkGoalsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
