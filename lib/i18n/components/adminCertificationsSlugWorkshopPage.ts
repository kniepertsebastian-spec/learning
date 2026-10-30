// Texte von app/admin/certifications/[slug]/workshop/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToCourseAdmin: "Zurück zur Kursverwaltung",
    courseNotFoundCompanyInternal: "Kurs nicht gefunden (interne Kurse einer Firma werden hier nicht bearbeitet).",
    editCourse: "Kurs bearbeiten",
    changesAreVisibleToLearners: "Änderungen sind sofort für Lernende sichtbar. Jeder frühere Stand bleibt in den Versionen erhalten.",
  },
  en: {
    backToCourseAdmin: "Back to course admin",
    courseNotFoundCompanyInternal: "Course not found (company-internal courses aren't edited here).",
    editCourse: "Edit course",
    changesAreVisibleToLearners: "Changes are visible to learners immediately. Every earlier version stays in the history.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminCertificationsSlugWorkshopPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
