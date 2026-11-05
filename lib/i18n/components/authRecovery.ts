// Texte von components/AuthRecovery.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    requestFailed: "Anfrage fehlgeschlagen.",
    emailAddress: "E-Mail-Adresse",
    backToSignIn: "Zurück zur Anmeldung",
    thePasswordsDoNotMatch: "Die Passwörter stimmen nicht überein.",
    resetFailed: "Zurücksetzen fehlgeschlagen.",
    setANewPassword: "Neues Passwort festlegen",
    newPasswordAtLeast8: "Neues Passwort (mindestens 8 Zeichen, Groß- und Kleinbuchstaben, Sonderzeichen)",
    repeatPassword: "Passwort wiederholen",
    savePassword: "Passwort speichern",
    verificationFailed: "Bestätigen fehlgeschlagen.",
    confirmYourEmailAddress: "E-Mail-Adresse bestätigen",
    yourEmailAddressIsConfirmed: "Deine E-Mail-Adresse ist bestätigt.",
    goToSignIn: "Zur Anmeldung",
    clickToConfirmYourEmail: "Klicke, um deine E-Mail-Adresse zu bestätigen.",
    confirmEmail: "E-Mail bestätigen",
    confirmationFailed: "Bestätigen fehlgeschlagen.",
    confirmYourCompany: "Unternehmen bestätigen",
    goToCompanyArea: "Zum Firmenbereich",
    clickToConfirmThatThis: "Klicke, um zu bestätigen, dass diese Firmen-E-Mail-Adresse dir gehört. Danach wird das Unternehmen angelegt.",
    confirmCompany: "Unternehmen bestätigen",
    n0WasCreatedYouAre: "„{0}“ ist angelegt, du bist Firmen-Admin.",
  },
  en: {
    requestFailed: "Request failed.",
    emailAddress: "Email address",
    backToSignIn: "Back to sign in",
    thePasswordsDoNotMatch: "The passwords do not match.",
    resetFailed: "Reset failed.",
    setANewPassword: "Set a new password",
    newPasswordAtLeast8: "New password (at least 8 characters, upper and lower case, special character)",
    repeatPassword: "Repeat password",
    savePassword: "Save password",
    verificationFailed: "Verification failed.",
    confirmYourEmailAddress: "Confirm your email address",
    yourEmailAddressIsConfirmed: "Your email address is confirmed.",
    goToSignIn: "Go to sign in",
    clickToConfirmYourEmail: "Click to confirm your email address.",
    confirmEmail: "Confirm email",
    confirmationFailed: "Confirmation failed.",
    confirmYourCompany: "Confirm your company",
    goToCompanyArea: "Go to company area",
    clickToConfirmThatThis: "Click to confirm that this company email address is yours. The company is created afterwards.",
    confirmCompany: "Confirm company",
    n0WasCreatedYouAre: "\"{0}\" was created, you are its company admin.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_authRecovery(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
