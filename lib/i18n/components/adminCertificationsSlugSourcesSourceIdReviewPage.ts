// Texte von app/admin/certifications/[slug]/sources/[sourceId]/review/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    backToAdminDashboard: "Zurück zum Admin-Dashboard",
    certificationNotFound: "Zertifizierung nicht gefunden",
    backToSources: "Zurück zu den Quellen",
    sourceNotFound: "Quelle nicht gefunden",
    noBlueprintProposalForThis: "Für diese Quelle liegt noch kein Blueprint-Vorschlag vor. Erst auf der Quellen-Seite extrahieren.",
    reviewAndApproveBlueprint: "Blueprint prüfen und freigeben",
  },
  en: {
    backToAdminDashboard: "Back to admin dashboard",
    certificationNotFound: "Certification not found",
    backToSources: "Back to sources",
    sourceNotFound: "Source not found",
    noBlueprintProposalForThis: "No blueprint proposal for this source yet. Extract one on the sources page first.",
    reviewAndApproveBlueprint: "Review and approve blueprint",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminCertificationsSlugSourcesSourceIdReviewPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
