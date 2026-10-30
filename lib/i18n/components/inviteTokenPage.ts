// Texte von app/invite/[token]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    invitationInvalidOrExpired: "Einladung ungültig oder abgelaufen",
    pleaseAskForANew: "Bitte lass dir einen neuen Link schicken.",
    backToHome: "Zur Startseite",
    invitation: "Einladung",
    youWereInvitedTo: "Du wurdest zu ",
    as: " eingeladen, als ",
    for: "Gilt für: ",
    signInWithThisEmail: "Melde dich mit dieser E-Mail-Adresse an oder registriere dich.",
    register: "Registrieren",
    signIn: "Anmelden",
    thisInvitationIsFor0: "Diese Einladung gilt für {0}. Du bist als {1} angemeldet.",
  },
  en: {
    invitationInvalidOrExpired: "Invitation invalid or expired",
    pleaseAskForANew: "Please ask for a new link.",
    backToHome: "Back to home",
    invitation: "Invitation",
    youWereInvitedTo: "You were invited to ",
    as: " as ",
    for: "For: ",
    signInWithThisEmail: "Sign in with this email address or register.",
    register: "Register",
    signIn: "Sign in",
    thisInvitationIsFor0: "This invitation is for {0}. You are signed in as {1}.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_inviteTokenPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
