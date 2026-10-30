// Texte von components/experts/ExpertProfileView.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    present: "heute",
    photoOf: "Foto von",
    expertReviewer: "Fachlicher Prüfer",
    about: "Kurzvorstellung",
    experience: "Erfahrung",
    certifications: "Zertifikate",
    expired: "abgelaufen",
    expiresSoon: "läuft bald ab",
    earned: "Erworben",
    validUntil: "gültig bis",
    proofAtTheVendor: "Nachweis beim Hersteller",
    proofCheckedOn: "Nachweis geprüft am",
    proofNotCheckedYet: "Nachweis noch nicht geprüft",
    reviewedCourses: "Geprüfte Kurse",
    version: "Version",
  },
  en: {
    present: "present",
    photoOf: "Photo of",
    expertReviewer: "Expert reviewer",
    about: "About",
    experience: "Experience",
    certifications: "Certifications",
    expired: "expired",
    expiresSoon: "expires soon",
    earned: "Earned",
    validUntil: "valid until",
    proofAtTheVendor: "Proof at the vendor",
    proofCheckedOn: "Proof checked on",
    proofNotCheckedYet: "Proof not checked yet",
    reviewedCourses: "Reviewed courses",
    version: "Version",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_expertsExpertProfileView(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
