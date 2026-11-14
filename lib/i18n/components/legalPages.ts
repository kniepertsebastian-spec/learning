// Texte von app/datenschutz/page.tsx, app/impressum/page.tsx und components/legal/OperatorNotice.tsx (de/en).
// Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX. Die Inhalte der Datenschutzerklärung selbst stehen in lib/legal/privacy.ts.
const texts = {
  de: {
    privacyTitle: "Datenschutzerklärung",
    privacyDraft: "Entwurf: Die rechtliche Prüfung dieser Erklärung steht noch aus.",
    privacyIntro: "Hier steht, welche Angaben zu dir die Plattform speichert, wozu, wie lange und wer sie bekommt. Dieselben Angaben stehen in deinem Datenexport.",
    controller: "Verantwortlich",
    whichDetails: "Welche Angaben wir verarbeiten",
    details: "Angaben",
    purpose: "Zweck",
    retention: "Speicherdauer",
    recipients: "Empfänger",
    aiService: "KI-Dienst",
    aiIntro: "Für die Karrierepfade nutzt die Plattform die Gemini-Schnittstelle von Google (siehe „Berufsprofil, Skills und Karrierepfade“). Andere KI-Funktionen, etwa die Erstellung und Übersetzung von Kursen, arbeiten mit Kursinhalten und von Firmen hochgeladenen Dokumenten, nicht mit Angaben zu dir.",
    aiStatementMissing: "Verarbeitungsort und Ausschluss des Trainings auf Kundendaten sind noch nicht bestätigt (LEGAL_AI_STATEMENT).",
    technical: "Technisches",
    yourRights: "Deine Rechte",
    imprintTitle: "Impressum",
    imprintIntro: "Angaben zum Betreiber dieser Plattform.",
    operator: "Betreiber",
    operatorMissing:
      "Die Angaben zum Betreiber sind noch nicht hinterlegt (Name, Anschrift und E-Mail-Adresse). Sie werden in der Umgebung des Servers eingetragen (LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS, LEGAL_CONTACT_EMAIL).",
    representedBy: "Vertreten durch: ",
    email: "E-Mail: ",
    phone: "Telefon: ",
    register: "Registereintrag: ",
    vatId: "Umsatzsteuer-Identifikationsnummer: ",
  },
  en: {
    privacyTitle: "Privacy policy",
    privacyDraft: "Draft: this policy has not yet been reviewed legally.",
    privacyIntro: "This page lists which details about you the platform stores, why, for how long and who receives them. The same details are in your data export.",
    controller: "Controller",
    whichDetails: "Which details we process",
    details: "Details",
    purpose: "Purpose",
    retention: "Retention",
    recipients: "Recipients",
    aiService: "AI service",
    aiIntro: "For career paths the platform uses Google's Gemini interface (see “Career profile, skills and career paths”). Other AI features, such as creating and translating courses, work with course content and documents uploaded by companies, not with details about you.",
    aiStatementMissing: "Processing location and exclusion of training on customer data are not confirmed yet (LEGAL_AI_STATEMENT).",
    technical: "Technical",
    yourRights: "Your rights",
    imprintTitle: "Imprint",
    imprintIntro: "Details of the operator of this platform.",
    operator: "Operator",
    operatorMissing:
      "The operator's details are not set yet (name, address and email address). They are entered in the server environment (LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS, LEGAL_CONTACT_EMAIL).",
    representedBy: "Represented by: ",
    email: "Email: ",
    phone: "Phone: ",
    register: "Commercial register: ",
    vatId: "VAT ID: ",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_legalPages(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
