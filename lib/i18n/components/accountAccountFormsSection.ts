// Texte von app/account/account-forms-section.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    myAccount: "Mein Konto",
    company: "Unternehmen",
    youBelongTo: "Du gehörst zu",
    youUseThePlatformAs: "Du nutzt die Plattform als Privatperson. Wenn du für ein Unternehmen Lernpfade verwalten willst, lege es hier fest: Wir schicken einen Bestätigungslink an deine Firmen-E-Mail-Adresse.",
    changePassword: "Passwort ändern",
    exportMyData: "Meine Daten exportieren",
    downloadsAllYourStoredData: "Lädt alle deine gespeicherten Daten als JSON-Datei herunter: Konto, Mitgliedschaft, Lernfortschritt, Versuche, Lernsitzungen und deine Aktivitäten. Das Passwort ist nicht enthalten.",
    downloadData: "Daten herunterladen",
    deleteAccount: "Konto löschen",
  },
  en: {
    myAccount: "My account",
    company: "Company",
    youBelongTo: "You belong to",
    youUseThePlatformAs: "You use the platform as a private person. To manage learning for a company, set it up here: we send a confirmation link to your company email address.",
    changePassword: "Change password",
    exportMyData: "Export my data",
    downloadsAllYourStoredData: "Downloads all your stored data as a JSON file: account, membership, learning progress, attempts, study sessions and your activity. Your password is not included.",
    downloadData: "Download data",
    deleteAccount: "Delete account",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_accountAccountFormsSection(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
