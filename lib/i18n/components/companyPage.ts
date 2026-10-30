// Texte von app/company/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    results: "Ergebnisse",
    overdue: "überfällig",
    mandatoryTraining: "Pflichtschulung",
    internalLearning: "Interne Learnings",
    draftsOrJobsInProgress: "Entwürfe oder Aufträge in Arbeit",
    tasksModules: "Aufgaben & Module",
    awaitingConfirmationOrExpired: "wartet auf Bestätigung oder abgelaufen",
    documents: "Dokumente",
    team: "Team",
    signIn: "Anmeldung",
  },
  en: {
    results: "Results",
    overdue: "overdue",
    mandatoryTraining: "Mandatory training",
    internalLearning: "Internal learning",
    draftsOrJobsInProgress: "drafts or jobs in progress",
    tasksModules: "Tasks & modules",
    awaitingConfirmationOrExpired: "awaiting confirmation or expired",
    documents: "Documents",
    team: "Team",
    signIn: "Sign-in",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_companyPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
