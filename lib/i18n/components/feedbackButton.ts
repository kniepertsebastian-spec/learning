// Texte von components/FeedbackButton.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    thanksForYourReportWe: "Danke für deine Meldung! Wir schauen sie uns an.",
    reportAProblemFeedback: "Problem melden / Feedback",
    whatDidYouNotice: "Was ist dir aufgefallen?",
    kindOfProblem: "Art des Problems",
    brieflyDescribeWhatIsWrong: "Beschreibe kurz, was nicht stimmt oder wo es hakt.",
    description: "Beschreibung",
    courseChapterAndLessonAre: "Kurs, Kapitel und Lektion werden automatisch mitgeschickt.",
    send: "Senden",
    cancel: "Abbrechen",
  },
  en: {
    thatDidNotWork: "That did not work.",
    thanksForYourReportWe: "Thanks for your report! We will look into it.",
    reportAProblemFeedback: "Report a problem / feedback",
    whatDidYouNotice: "What did you notice?",
    kindOfProblem: "Kind of problem",
    brieflyDescribeWhatIsWrong: "Briefly describe what is wrong or where it gets stuck.",
    description: "Description",
    courseChapterAndLessonAre: "Course, chapter and lesson are sent along automatically.",
    send: "Send",
    cancel: "Cancel",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_feedbackButton(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
