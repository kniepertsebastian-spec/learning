// Texte von components/RemediationSession.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    keyPoints: "Kernpunkte",
    commonMisconceptions: "Häufige Missverständnisse",
    startPracticeQuestions: "Übungsfragen starten",
    improvementDetected: "Verbesserung erkannt.",
    noClearImprovementYetConsider: "Noch keine deutliche Verbesserung – eventuell nochmal wiederholen.",
  },
  en: {
    keyPoints: "Key points",
    commonMisconceptions: "Common misconceptions",
    startPracticeQuestions: "Start practice questions",
    improvementDetected: "Improvement detected.",
    noClearImprovementYetConsider: "No clear improvement yet – consider reviewing again.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_remediationSession(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
