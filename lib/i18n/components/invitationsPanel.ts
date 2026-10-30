// Texte von components/InvitationsPanel.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    couldNotCreateInvitation: "Einladung fehlgeschlagen.",
    couldNotRevoke: "Widerrufen fehlgeschlagen.",
    invitePeople: "Mitarbeiter einladen",
    theInvitedPersonReceivesAn: "Die eingeladene Person bekommt eine E-Mail mit dem Link. Du siehst ihn zusätzlich hier und kannst ihn selbst weitergeben. Er gilt 7 Tage, einmal und nur für die eingegebene E-Mail-Adresse.",
    noEmailIsSentYou: "Es wird keine E-Mail verschickt. Du bekommst einen Link, den du selbst weitergibst. Er gilt 7 Tage, einmal und nur für die eingegebene E-Mail-Adresse.",
    emailAddress: "E-Mail-Adresse",
    role: "Rolle",
    createLink: "Link erzeugen",
    theEmailCouldNotBe: "Die E-Mail konnte nicht verschickt werden. Gib den Link selbst weiter.",
    thisLinkIsShownOnly: "Dieser Link wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.",
    invitationLink: "Einladungslink",
    copied: "Kopiert",
    copyLink: "Link kopieren",
    openInvitations: "Offene Einladungen",
    noOpenInvitations: "Keine offenen Einladungen.",
    validUntil: "gültig bis ",
    revoke: "Widerrufen",
    linkFor0: "Link für {0}",
    emailSentTo0: "E-Mail an {0} wurde verschickt.",
    revokeInvitationFor0: "Einladung für {0} widerrufen",
  },
  en: {
    couldNotCreateInvitation: "Could not create invitation.",
    couldNotRevoke: "Could not revoke.",
    invitePeople: "Invite people",
    theInvitedPersonReceivesAn: "The invited person receives an email with the link. You also see it here and can pass it on yourself. It is valid for 7 days, once, and only for the entered email address.",
    noEmailIsSentYou: "No email is sent. You get a link to pass on yourself. It is valid for 7 days, once, and only for the entered email address.",
    emailAddress: "Email address",
    role: "Role",
    createLink: "Create link",
    theEmailCouldNotBe: "The email could not be sent. Pass the link on yourself.",
    thisLinkIsShownOnly: "This link is shown only now. It cannot be retrieved later.",
    invitationLink: "Invitation link",
    copied: "Copied",
    copyLink: "Copy link",
    openInvitations: "Open invitations",
    noOpenInvitations: "No open invitations.",
    validUntil: "valid until ",
    revoke: "Revoke",
    linkFor0: "Link for {0}",
    emailSentTo0: "Email sent to {0}.",
    revokeInvitationFor0: "Revoke invitation for {0}",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_invitationsPanel(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
