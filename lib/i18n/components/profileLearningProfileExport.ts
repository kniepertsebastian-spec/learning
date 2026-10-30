// Texte von components/profile/LearningProfileExport.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thePdfCouldNotBe: "Das PDF konnte nicht erstellt werden.",
    revokeThisPdfTheVerification: "Dieses PDF widerrufen? Die Prüfseite zeigt es danach als widerrufen.",
    learningProfileAsAPdf: "Lernprofil als PDF-Nachweis",
    aStandardisedTamperProofRecord: "Ein standardisierter, fälschungssicherer Nachweis über deinen Kenntnisstand, z. B. für Arbeitgeber. Aufgeführt werden nur Kurse, zu denen eine erfolgreiche Zertifikatsprüfung hinterlegt ist. Jedes PDF trägt einen Prüfcode und lässt sich online prüfen.",
    noneOfYourCoursesHas: "Noch keiner deiner Kurse hat eine hinterlegte, bestandene Zertifikatsprüfung. Trage sie unter „Meine Zertifikate“ ein und verknüpfe sie mit dem Kurs.",
    createPdf: "PDF erstellen",
    issuedOn: "Ausgestellt am",
    revoked: "widerrufen",
    verificationPage: "Prüfseite",
    revoke: "Widerrufen",
  },
  en: {
    thePdfCouldNotBe: "The PDF could not be created.",
    revokeThisPdfTheVerification: "Revoke this PDF? The verification page will then show it as revoked.",
    learningProfileAsAPdf: "Learning profile as a PDF record",
    aStandardisedTamperProofRecord: "A standardised, tamper-proof record of your knowledge, e.g. for employers. Only courses with a recorded, passed certification exam are listed. Every PDF carries a verification code and can be checked online.",
    noneOfYourCoursesHas: "None of your courses has a recorded, passed certification exam yet. Add it under “My certificates” and link it to the course.",
    createPdf: "Create PDF",
    issuedOn: "Issued on",
    revoked: "revoked",
    verificationPage: "Verification page",
    revoke: "Revoke",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_profileLearningProfileExport(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
