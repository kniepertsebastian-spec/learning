// Texte von components/ExamRemindersToggle.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    examPlannerEmailReminders: "E-Mail-Erinnerungen des Prüfungsplaners",
    voucherExpiringExamComingUp: "Voucher läuft ab, Prüfung steht bevor, Wiederholungsversuch enthalten.",
    thatDidNotWork: "Das hat nicht geklappt.",
  },
  en: {
    examPlannerEmailReminders: "Exam planner email reminders",
    voucherExpiringExamComingUp: "Voucher expiring, exam coming up, retake included.",
    thatDidNotWork: "That did not work.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_examRemindersToggle(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
