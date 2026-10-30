// Texte von components/admin/stats/CompletionChart.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    finalExamPassed: "Abschlussprüfung bestanden",
    certificateIssued: "Zertifikat ausgestellt",
    noCompletionsInThisPeriod: "Noch keine Abschlüsse in diesem Zeitraum.",
    completions: "Abschlüsse",
    asTable: "Als Tabelle",
    periodFrom: "Zeitraum ab",
  },
  en: {
    finalExamPassed: "Final exam passed",
    certificateIssued: "Certificate issued",
    noCompletionsInThisPeriod: "No completions in this period yet.",
    completions: "completions",
    asTable: "As table",
    periodFrom: "Period from",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminStatsCompletionChart(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
