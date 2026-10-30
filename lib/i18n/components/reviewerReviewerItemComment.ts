// Texte von components/reviewer/ReviewerItemComment.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    reportedAsFaulty: "Fehlerhaft gemeldet",
    comment: "Kommentar",
    open: "offen",
    resolved: "erledigt",
    comment2: "Kommentieren",
    sendComment: "Kommentar senden",
    reportAsFaulty: "Als fehlerhaft melden",
    cancel: "Abbrechen",
  },
  en: {
    reportedAsFaulty: "Reported as faulty",
    comment: "Comment",
    open: "open",
    resolved: "resolved",
    comment2: "Comment",
    sendComment: "Send comment",
    reportAsFaulty: "Report as faulty",
    cancel: "Cancel",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerReviewerItemComment(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
