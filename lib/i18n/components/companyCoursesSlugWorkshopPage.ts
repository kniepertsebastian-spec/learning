// Texte von app/company/courses/[slug]/workshop/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToInternalLearning: "Zurück zu den internen Learnings",
    editCourse: "Kurs bearbeiten",
    changesAreVisibleToLearners: "Änderungen sind sofort für Lernende sichtbar. Jeder frühere Stand bleibt in den Versionen erhalten. Freigeben kannst du bei den internen Learnings.",
  },
  en: {
    backToInternalLearning: "Back to internal learning",
    editCourse: "Edit course",
    changesAreVisibleToLearners: "Changes are visible to learners immediately. Every earlier version stays in the history. You approve the course under internal learning.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_companyCoursesSlugWorkshopPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
