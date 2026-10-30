// Texte von components/BlueprintPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    blueprintExtractionFailed: "Blueprint-Extraktion fehlgeschlagen.",
    blueprintProposalR12R1: "Blueprint-Vorschlag (R1.2/R1.3)",
    approved: "Freigegeben",
    reExtract: "Erneut extrahieren",
    extractBlueprint: "Blueprint extrahieren",
    domains: "Domains",
    objectives: "Objectives",
    errors: "Fehler",
    warnings: "Hinweise",
    truncated: "gekürzt",
    reviewApprove: "Prüfen & freigeben",
  },
  en: {
    blueprintExtractionFailed: "Blueprint extraction failed.",
    blueprintProposalR12R1: "Blueprint proposal (R1.2/R1.3)",
    approved: "Approved",
    reExtract: "Re-extract",
    extractBlueprint: "Extract blueprint",
    domains: "domains",
    objectives: "objectives",
    errors: "errors",
    warnings: "warnings",
    truncated: "truncated",
    reviewApprove: "Review & approve",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_blueprintPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
