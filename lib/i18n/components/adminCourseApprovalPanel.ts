// Texte von components/admin/CourseApprovalPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    expertApproval: "Fachliche Freigabe",
    thisCourseIsNotApproved: "Dieser Kurs ist nicht freigegeben. Ohne Freigabe gibt es kein Siegel.",
    reviewedBy: "Geprüft von",
    version: "Version",
    noChangesSinceTheReview: "Keine Änderungen seit der Prüfung.",
    lesson: "Lektion",
    question: "Frage",
    approve: "Freigeben",
    approveAgain: "Neu freigeben",
    reviewerName: "Name der prüfenden Person",
    iHaveProfessionallyReviewedThe: "Ich habe die Inhalte dieser Version fachlich geprüft.",
    saveApproval: "Freigabe speichern",
    noteEGTypoFixed: "Notiz, z. B. „Tippfehler korrigiert“",
    editorialNote: "Notiz zur redaktionellen Änderung",
    acceptAsEditorial: "Als redaktionell übernehmen",
    history: "Protokoll",
  },
  en: {
    expertApproval: "Expert approval",
    thisCourseIsNotApproved: "This course is not approved. Without approval there is no seal.",
    reviewedBy: "Reviewed by",
    version: "Version",
    noChangesSinceTheReview: "No changes since the review.",
    lesson: "Lesson",
    question: "Question",
    approve: "Approve",
    approveAgain: "Approve again",
    reviewerName: "Reviewer name",
    iHaveProfessionallyReviewedThe: "I have professionally reviewed the content of this version.",
    saveApproval: "Save approval",
    noteEGTypoFixed: "Note, e.g. “typo fixed”",
    editorialNote: "Editorial note",
    acceptAsEditorial: "Accept as editorial",
    history: "History",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminCourseApprovalPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
