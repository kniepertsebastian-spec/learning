// Texte von components/admin/ReviewerCertVerification.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    reviewersCertificationProofs: "Zertifikats-Nachweise der Prüfer",
    openTheLinkCheckName: "Öffne den Link, prüfe auf der Seite des Herstellers Name und Gültigkeit und markiere den Nachweis dann als geprüft. Erst danach steht auf dem öffentlichen Profil „Nachweis geprüft am …“.",
    noCertificationsEnteredYet: "Noch keine Zertifikate eingetragen.",
    checked: "geprüft",
    open: "offen",
    undoCheck: "Prüfung zurücknehmen",
    markAsChecked: "Als geprüft markieren",
  },
  en: {
    thatDidNotWork: "That did not work.",
    reviewersCertificationProofs: "Reviewers' certification proofs",
    openTheLinkCheckName: "Open the link, check name and validity on the vendor's page, then mark the proof as checked. Only then the public profile says “Proof checked on …”.",
    noCertificationsEnteredYet: "No certifications entered yet.",
    checked: "checked",
    open: "open",
    undoCheck: "Undo check",
    markAsChecked: "Mark as checked",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminReviewerCertVerification(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
