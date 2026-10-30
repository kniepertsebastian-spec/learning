// Texte von components/AccountForms.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    theNewPasswordsDoNot: "Die neuen Passwörter stimmen nicht überein.",
    couldNotChangeThePassword: "Passwort konnte nicht geändert werden.",
    afterChangingItYouAre: "Nach dem Ändern wirst du auf allen Geräten abgemeldet und meldest dich neu an.",
    currentPassword: "Aktuelles Passwort",
    newPasswordAtLeast8: "Neues Passwort (mindestens 8 Zeichen)",
    repeatNewPassword: "Neues Passwort wiederholen",
    changePassword: "Passwort ändern",
    couldNotDeleteTheAccount: "Konto konnte nicht gelöscht werden.",
    yourAccountAndAllYour: "Dein Konto und alle deine Lern- und Mitgliedsdaten werden unwiderruflich gelöscht. Das lässt sich nicht rückgängig machen. Exportiere vorher deine Daten, wenn du sie behalten willst.",
    passwordToConfirm: "Passwort zur Bestätigung",
    iUnderstandMyAccountAnd: "Ich weiß, dass mein Konto und meine Daten endgültig gelöscht werden.",
    deleteAccountPermanently: "Konto endgültig löschen",
    requestFailed: "Anfrage fehlgeschlagen.",
    companyName: "Firmenname",
    companyEmail: "Firmen-E-Mail",
    sendConfirmationLink: "Bestätigungslink senden",
    weSentAConfirmationLink: "Wir haben einen Bestätigungslink an {0} geschickt. Mit dem Klick wird das Unternehmen angelegt.",
  },
  en: {
    theNewPasswordsDoNot: "The new passwords do not match.",
    couldNotChangeThePassword: "Could not change the password.",
    afterChangingItYouAre: "After changing it you are signed out on all devices and sign in again.",
    currentPassword: "Current password",
    newPasswordAtLeast8: "New password (at least 8 characters)",
    repeatNewPassword: "Repeat new password",
    changePassword: "Change password",
    couldNotDeleteTheAccount: "Could not delete the account.",
    yourAccountAndAllYour: "Your account and all your learning and membership data are deleted permanently. This cannot be undone. Export your data first if you want to keep it.",
    passwordToConfirm: "Password to confirm",
    iUnderstandMyAccountAnd: "I understand my account and data will be deleted for good.",
    deleteAccountPermanently: "Delete account permanently",
    requestFailed: "Request failed.",
    companyName: "Company name",
    companyEmail: "Company email",
    sendConfirmationLink: "Send confirmation link",
    weSentAConfirmationLink: "We sent a confirmation link to {0}. Clicking it creates the company.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_accountForms(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
