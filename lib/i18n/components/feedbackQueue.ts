// Texte von components/FeedbackQueue.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    feedbackFromLearners: "Rückmeldungen von Lernenden",
    noOpenFeedback: "Keine offenen Rückmeldungen.",
    resolved: "Erledigt",
    dismiss: "Verwerfen",
  },
  en: {
    feedbackFromLearners: "Feedback from learners",
    noOpenFeedback: "No open feedback.",
    resolved: "Resolved",
    dismiss: "Dismiss",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_feedbackQueue(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
