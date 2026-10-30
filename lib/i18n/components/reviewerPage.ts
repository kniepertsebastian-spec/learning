// Texte von app/reviewer/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    myCourse: "Mein Kurs",
    youLookAfterExactlyOne: "Du betreust genau einen Kurs, den dir die Betreiber zugewiesen haben. Du kannst ihn lesen, kommentieren, Fragen als fehlerhaft melden, Lektionen, Simulationen und Fragen von Hand bearbeiten und freigeben.",
    youCanApproveCoursesAnd: "Freigeben und dein Profil veröffentlichen kannst du erst nach dem Probe-Review. ",
    toTheTrialReview: "Zum Probe-Review",
    manageMyExpertProfile: "Mein Expertenprofil pflegen",
    noCourseIsAssignedTo: "Dir ist noch kein Kurs zugewiesen.",
    notApprovedYet: "Noch nicht freigegeben",
    approvedBy: "Freigegeben von",
    version: "Version",
  },
  en: {
    myCourse: "My course",
    youLookAfterExactlyOne: "You look after exactly one course, assigned to you by the operators. You can read it, comment, report questions as faulty, edit lessons, simulations and questions by hand, and approve it.",
    youCanApproveCoursesAnd: "You can approve courses and publish your profile only after the trial review. ",
    toTheTrialReview: "To the trial review",
    manageMyExpertProfile: "Manage my expert profile",
    noCourseIsAssignedTo: "No course is assigned to you yet.",
    notApprovedYet: "Not approved yet",
    approvedBy: "Approved by",
    version: "Version",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
