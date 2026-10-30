// Texte von components/reviewer/ReviewerApprovalPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    approval: "Freigabe",
    lastApprovedBy: "Zuletzt freigegeben von",
    version: "Version",
    thisCourseHasNotBeen: "Dieser Kurs ist noch nicht freigegeben.",
    youHaveNotApprovedThis: "Du hast diesen Kurs noch nicht freigegeben: Prüfe bitte den ganzen Kurs.",
    lesson: "Lektion",
    question: "Frage",
    noChangesSinceYourLast: "Keine Änderungen seit deiner letzten Freigabe.",
    nameShownWithTheApproval: "Name, der bei der Freigabe angezeigt wird",
    yourNameShown: "Dein Name (wird angezeigt)",
    iHaveProfessionallyReviewedThe: "Ich habe die Inhalte dieser Version fachlich geprüft.",
    approve: "Freigeben",
    youCanApproveOnlyAfter: "Freigeben kannst du erst nach dem Probe-Review (oder wenn der Betreiber dich freischaltet).",
  },
  en: {
    approval: "Approval",
    lastApprovedBy: "Last approved by",
    version: "Version",
    thisCourseHasNotBeen: "This course has not been approved yet.",
    youHaveNotApprovedThis: "You have not approved this course yet: please review the whole course.",
    lesson: "Lesson",
    question: "Question",
    noChangesSinceYourLast: "No changes since your last approval.",
    nameShownWithTheApproval: "Name shown with the approval",
    yourNameShown: "Your name (shown)",
    iHaveProfessionallyReviewedThe: "I have professionally reviewed the content of this version.",
    approve: "Approve",
    youCanApproveOnlyAfter: "You can approve only after the trial review (or when the operator clears you).",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerReviewerApprovalPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
