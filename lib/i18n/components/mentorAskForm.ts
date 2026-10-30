// Texte von components/MentorAskForm.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    topic: "Thema",
    whereIAmStuck: "Wo ich hänge",
    messageLogPastedByMe: "Meldung / Log (von mir eingefügt)",
    thatDidNotWork: "Das hat nicht geklappt.",
    sentYourMentorWillGet: "Gesendet. Dein Mentor meldet sich.",
    iAmStuckAskMy: "Ich hänge fest – Mentor fragen",
    whereAreYouStuckIn: "Wo hängst du? (in deinen Worten)",
    errorMessageOrLogOptional: "Fehlermeldung oder Log (optional, nur was du selbst einfügst)",
    thisGoesToYourMentor: "Das geht an deinen Mentor:",
    sendAsShown: "So senden",
    cancel: "Abbrechen",
  },
  en: {
    topic: "Topic",
    whereIAmStuck: "Where I am stuck",
    messageLogPastedByMe: "Message / log (pasted by me)",
    thatDidNotWork: "That did not work.",
    sentYourMentorWillGet: "Sent. Your mentor will get back to you.",
    iAmStuckAskMy: "I am stuck – ask my mentor",
    whereAreYouStuckIn: "Where are you stuck? (in your own words)",
    errorMessageOrLogOptional: "Error message or log (optional, only what you paste yourself)",
    thisGoesToYourMentor: "This goes to your mentor:",
    sendAsShown: "Send as shown",
    cancel: "Cancel",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_mentorAskForm(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
