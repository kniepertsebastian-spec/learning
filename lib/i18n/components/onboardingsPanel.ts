// Texte von components/OnboardingsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    mentor: "Mentor: ",
    nobodyPleaseReassign: "niemand (bitte neu zuordnen)",
    archivePlan: "Plan archivieren",
    requiredCourses: "Benötigte Kurse: ",
    courses: "Kurse",
    markDiscussed: "Besprochen",
    onlyOnceAllCoursesAre: "Erst wenn alle Kurse abgeschlossen sind",
    markReviewed: "Geprüft",
    personForThisOnboarding: "Person für dieses Onboarding",
    choosePerson: "Person wählen …",
    startOnboarding: "Onboarding starten",
    defineWhichCoursesNewPeople: "Lege fest, welche Kurse neue Personen absolvieren müssen und wer sie als Mentor begleitet. Beim Start werden alle Kurse zugewiesen; der Mentor setzt den Stand „besprochen“ und, sobald alle Kurse abgeschlossen sind, „geprüft“.",
    noOnboardingPlanYet: "Noch kein Onboarding-Plan.",
    newPlan: "Neuer Plan",
    nameEGOperationsInfrastructure: "Name, z. B. Operations Infrastruktur",
    descriptionOptional: "Beschreibung (optional)",
    description: "Beschreibung",
    mentor2: "Mentor",
    requiredCourses2: "Benötigte Kurse",
    noAssignableCoursesYet: "Noch keine zuweisbaren Kurse.",
    createPlan: "Plan anlegen",
  },
  en: {
    mentor: "Mentor: ",
    nobodyPleaseReassign: "nobody (please reassign)",
    archivePlan: "Archive plan",
    requiredCourses: "Required courses: ",
    courses: "courses",
    markDiscussed: "Mark discussed",
    onlyOnceAllCoursesAre: "Only once all courses are completed",
    markReviewed: "Mark reviewed",
    personForThisOnboarding: "Person for this onboarding",
    choosePerson: "Choose person …",
    startOnboarding: "Start onboarding",
    defineWhichCoursesNewPeople: "Define which courses new people must complete and who mentors them. Starting an onboarding assigns all courses; the mentor marks it “discussed” and, once every course is completed, “reviewed”.",
    noOnboardingPlanYet: "No onboarding plan yet.",
    newPlan: "New plan",
    nameEGOperationsInfrastructure: "Name, e.g. Operations Infrastructure",
    descriptionOptional: "Description (optional)",
    description: "Description",
    mentor2: "Mentor",
    requiredCourses2: "Required courses",
    noAssignableCoursesYet: "No assignable courses yet.",
    createPlan: "Create plan",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_onboardingsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
