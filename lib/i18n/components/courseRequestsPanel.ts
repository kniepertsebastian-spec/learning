// Texte von components/CourseRequestsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    requestFailed: "Anfrage fehlgeschlagen.",
    requestReceivedYouCanFollow: "Anfrage ist eingegangen. Den Stand siehst du hier.",
    reallyWithdrawThisRequest: "Anfrage wirklich zurückziehen?",
    couldNotWithdraw: "Zurückziehen fehlgeschlagen.",
    requestGeneralLearningPaths: "Allgemeine Lernpfade anfragen",
    weCreateGeneralLearningPaths: "Allgemeine Lernpfade (z. B. Security oder Zertifikate) erstellen wir und geben sie für deine Firma frei. Gibt es den Kurs schon, geben wir ihn frei. Sonst erstellen wir ihn, lassen ihn fachlich prüfen und melden uns. Bis dahin steht hier der aktuelle Stand.",
    fromTheCatalog: "Aus dem Katalog",
    freeWish: "Freier Wunsch",
    learningPath: "Lernpfad",
    whatShouldTheCourseCover: "Was soll der Kurs behandeln?",
    wish: "Wunsch",
    audienceScopeSpecificsOptional: "Zielgruppe, Umfang, Besonderheiten (optional)",
    description: "Beschreibung",
    request: "Anfragen",
    yourRequests: "Deine Anfragen",
    noRequestsYet: "Noch keine Anfragen.",
    withdrawRequest: "Anfrage zurückziehen",
  },
  en: {
    requestFailed: "Request failed.",
    requestReceivedYouCanFollow: "Request received. You can follow its status here.",
    reallyWithdrawThisRequest: "Really withdraw this request?",
    couldNotWithdraw: "Could not withdraw.",
    requestGeneralLearningPaths: "Request general learning paths",
    weCreateGeneralLearningPaths: "We create general learning paths (e.g. security or certifications) and release them for your company. If the course exists we release it. Otherwise we create it, have it reviewed by an expert and get back to you. The current status is shown here.",
    fromTheCatalog: "From the catalog",
    freeWish: "Free wish",
    learningPath: "Learning path",
    whatShouldTheCourseCover: "What should the course cover?",
    wish: "Wish",
    audienceScopeSpecificsOptional: "Audience, scope, specifics (optional)",
    description: "Description",
    request: "Request",
    yourRequests: "Your requests",
    noRequestsYet: "No requests yet.",
    withdrawRequest: "Withdraw request",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_courseRequestsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
