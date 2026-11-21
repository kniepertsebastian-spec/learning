// Texte von app/login/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    tagline: "Capture Knowledge. Empower People. Strengthen Business.",
    signIn: "Anmelden",
    signingIn: "Anmeldung läuft …",
    email: "E-Mail-Adresse",
    password: "Passwort",
    invalidCredentials: "E-Mail-Adresse oder Passwort ist falsch.",
    passwordChanged: "Passwort geändert. Bitte melde dich erneut an.",
    accountDeleted: "Dein Konto wurde gelöscht.",
    passwordReset: "Passwort zurückgesetzt. Bitte melde dich mit deinem neuen Passwort an.",
    emailVerified: "E-Mail-Adresse bestätigt. Du kannst dich jetzt anmelden.",
    signInWithSso: "Mit Firmenkonto anmelden (SSO)",
    forgotPassword: "Passwort vergessen?",
    resendConfirmation: "Bestätigungs-E-Mail erneut senden",
    noAccount: "Noch kein Konto?",
    register: "Registrieren",
  },
  en: {
    tagline: "Capture Knowledge. Empower People. Strengthen Business.",
    signIn: "Sign in",
    signingIn: "Signing in…",
    email: "Email",
    password: "Password",
    invalidCredentials: "Invalid email or password.",
    passwordChanged: "Password changed. Please sign in again.",
    accountDeleted: "Your account has been deleted.",
    passwordReset: "Password reset. Please sign in with your new password.",
    emailVerified: "Email confirmed. You can sign in now.",
    signInWithSso: "Sign in with company account (SSO)",
    forgotPassword: "Forgot password?",
    resendConfirmation: "Resend confirmation email",
    noAccount: "No account?",
    register: "Register",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_loginPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
