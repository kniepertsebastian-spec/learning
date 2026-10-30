// Texte von components/ContentReportQueue.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    reportedQuestions: "Gemeldete Fragen",
    loading: "Lädt …",
    noOpenReports: "Keine offenen Meldungen.",
    resolved: "Erledigt",
    dismiss: "Verwerfen",
    concept01Of2: "Konzept „{0}“: {1} von {2} Lernenden im Verstehens-Modus.",
  },
  en: {
    reportedQuestions: "Reported questions",
    loading: "Loading …",
    noOpenReports: "No open reports.",
    resolved: "Resolved",
    dismiss: "Dismiss",
    concept01Of2: "Concept \"{0}\": {1} of {2} learners in understanding mode.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_contentReportQueue(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
