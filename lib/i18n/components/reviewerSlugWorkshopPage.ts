// Texte von app/reviewer/[slug]/workshop/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToTheCourseView: "Zurück zur Kursansicht",
    editCourse: "Kurs bearbeiten",
    changesAreVisibleToLearners: "Änderungen sind sofort für Lernende sichtbar. Jeder frühere Stand bleibt in den Versionen erhalten. Freigeben kannst du in der Kursansicht.",
  },
  en: {
    backToTheCourseView: "Back to the course view",
    editCourse: "Edit course",
    changesAreVisibleToLearners: "Changes are visible to learners immediately. Every earlier version stays in the history. You approve the course in the course view.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerSlugWorkshopPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
