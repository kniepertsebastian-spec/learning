// Texte von components/DeleteCertification.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    couldNotLoad: "Konnte nicht geladen werden.",
    deleteFailed: "Löschen fehlgeschlagen.",
    deleteCourse: "Kurs löschen",
    removesTheCourseWithAll: "Entfernt den Kurs mit allen Lernzielen, Lektionen, Fragen und Quellen, z. B. ein doppelt angelegter Kurs.",
    delete: "Löschen …",
    noLearnerDataOrAssignments: "Am Kurs hängen keine Lerndaten oder Zuweisungen.",
    iUnderstandThisDataWill: "Ich weiß, dass diese Daten unwiderruflich gelöscht werden.",
    deletePermanently: "Endgültig löschen",
    cancel: "Abbrechen",
    n0LearnerSWithProgress: "{0} Person(en) mit Lernstand (geht verloren)",
    n0CompanyAssignmentS: "{0} Firmenzuweisung(en)",
    n0CompanyReleaseS: "{0} Firmenfreischaltung(en)",
    n0MandatoryRuleS: "{0} Pflichtregel(n)",
  },
  en: {
    couldNotLoad: "Could not load.",
    deleteFailed: "Delete failed.",
    deleteCourse: "Delete course",
    removesTheCourseWithAll: "Removes the course with all objectives, lessons, questions and sources, e.g. a duplicate.",
    delete: "Delete …",
    noLearnerDataOrAssignments: "No learner data or assignments are attached.",
    iUnderstandThisDataWill: "I understand this data will be deleted permanently.",
    deletePermanently: "Delete permanently",
    cancel: "Cancel",
    n0LearnerSWithProgress: "{0} learner(s) with progress (lost)",
    n0CompanyAssignmentS: "{0} company assignment(s)",
    n0CompanyReleaseS: "{0} company release(s)",
    n0MandatoryRuleS: "{0} mandatory rule(s)",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_deleteCertification(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
