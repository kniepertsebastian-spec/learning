// Texte von app/admin/requests/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    customerRequestsAndCourseReleases: "Kundenanfragen und Lernpfad-Freigaben",
  },
  en: {
    customerRequestsAndCourseReleases: "Customer requests and course releases",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminRequestsPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
