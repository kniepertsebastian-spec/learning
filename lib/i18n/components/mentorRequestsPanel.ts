// Texte von components/MentorRequestsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    shortReplyOptional: "Kurze Antwort (optional)",
    reply: "Antwort",
    markAnswered: "Beantwortet",
    helpRequests: "Hilfe-Anfragen",
    noOpenRequests: "Keine offenen Anfragen.",
  },
  en: {
    thatDidNotWork: "That did not work.",
    shortReplyOptional: "Short reply (optional)",
    reply: "Reply",
    markAnswered: "Mark answered",
    helpRequests: "Help requests",
    noOpenRequests: "No open requests.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_mentorRequestsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
