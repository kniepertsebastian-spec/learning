// Texte von app/admin/certifications/[slug]/sources/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToAdminDashboard: "Zurück zum Admin-Dashboard",
    certificationNotFound: "Zertifizierung nicht gefunden",
    officialSources: "Offizielle Quellen",
    uploadOfficialExamDocumentationAs: "Offizielle Prüfungsunterlagen als PDF hochladen und ihren Text extrahieren. Quelle der Wahrheit für Domains, Objectives und Lernmaterial (R1).",
  },
  en: {
    backToAdminDashboard: "Back to admin dashboard",
    certificationNotFound: "Certification not found",
    officialSources: "Official sources",
    uploadOfficialExamDocumentationAs: "Upload official exam documentation as PDF and extract its text. Source of truth for domains, objectives, and learning material (R1).",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminCertificationsSlugSourcesPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
