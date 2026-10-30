// Texte von components/admin/ExamInfoForm.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    saved: "Gespeichert.",
    invalidInputLinksMustStart: "Ungültige Angaben (Links müssen mit https:// beginnen).",
    examDetailsExamPlanner: "Prüfungsdaten (Prüfungsplaner)",
    shownInLearnersExamPlanner: "Erscheinen im Prüfungsplaner der Lernenden: Buchungslink, Testcenter, Gültigkeit, Hinweis auf eine Nachfolgeversion.",
    examProvider: "Prüfungsanbieter",
    other: "Anderer",
    delivery: "Prüfungsformen",
    online: "Online",
    testCenter: "Testcenter",
    bookingLink: "Buchungslink",
    testCenterLink: "Testcenter-Link",
    validityMonthsEmptyUnlimited: "Gültigkeit (Monate, leer = unbegrenzt)",
    successorVersionNoteOptional: "Hinweis auf Nachfolgeversion (optional)",
    save: "Speichern",
  },
  en: {
    saved: "Saved.",
    invalidInputLinksMustStart: "Invalid input (links must start with https://).",
    examDetailsExamPlanner: "Exam details (exam planner)",
    shownInLearnersExamPlanner: "Shown in learners' exam planner: booking link, test center, validity, successor version note.",
    examProvider: "Exam provider",
    other: "Other",
    delivery: "Delivery",
    online: "Online",
    testCenter: "Test center",
    bookingLink: "Booking link",
    testCenterLink: "Test center link",
    validityMonthsEmptyUnlimited: "Validity (months, empty = unlimited)",
    successorVersionNoteOptional: "Successor version note (optional)",
    save: "Save",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminExamInfoForm(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
