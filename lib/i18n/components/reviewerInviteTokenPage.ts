// Texte von app/reviewer-invite/[token]/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    invitationAsExpertReviewer: "Einladung als fachlicher Prüfer",
    thisInvitationIsInvalidOr: "Diese Einladung ist ungültig oder abgelaufen.",
    youCanReviewAndApprove: "Du kannst Kurse fachlich prüfen und freigeben. Die Einladung gilt für",
    signIn: "Anmelden",
    register: "Registrieren",
    assigned0: "; zugewiesen werden: {0}.",
  },
  en: {
    invitationAsExpertReviewer: "Invitation as expert reviewer",
    thisInvitationIsInvalidOr: "This invitation is invalid or has expired.",
    youCanReviewAndApprove: "You can review and approve courses. The invitation is for",
    signIn: "Sign in",
    register: "Register",
    assigned0: "; assigned: {0}.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerInviteTokenPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
