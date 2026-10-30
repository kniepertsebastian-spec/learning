// Texte von app/reviewer/[slug]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToMyCourses: "Zurück zu meinen Kursen",
    editCourse: "Kurs bearbeiten",
    explanation: "Erklärung",
  },
  en: {
    backToMyCourses: "Back to my courses",
    editCourse: "Edit course",
    explanation: "Explanation",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerSlugPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
