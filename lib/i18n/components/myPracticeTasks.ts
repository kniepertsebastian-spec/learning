// Texte von components/MyPracticeTasks.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    noteForTheReviewerOptional: "Notiz für die Bestätigung (optional)",
    note: "Notiz",
    updateNote: "Notiz aktualisieren",
    doneSendForConfirmation: "Erledigt – zur Bestätigung",
    practiceTasks: "Praxisaufgaben",
    someoneElseAtYourCompany: "Eine andere Person aus deiner Firma bestätigt die Aufgabe. Deine Firma sieht nur, wie viele bestätigt sind, nicht deine Notizen.",
  },
  en: {
    thatDidNotWork: "That did not work.",
    noteForTheReviewerOptional: "Note for the reviewer (optional)",
    note: "Note",
    updateNote: "Update note",
    doneSendForConfirmation: "Done – send for confirmation",
    practiceTasks: "Practice tasks",
    someoneElseAtYourCompany: "Someone else at your company confirms the task. Your company only sees how many are confirmed, not your notes.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_myPracticeTasks(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
