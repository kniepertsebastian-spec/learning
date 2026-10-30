// Texte von components/AcceptInvitationButton.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    couldNotAcceptTheInvitation: "Annehmen fehlgeschlagen.",
    accepting: "Wird angenommen…",
    acceptInvitation: "Einladung annehmen",
  },
  en: {
    couldNotAcceptTheInvitation: "Could not accept the invitation.",
    accepting: "Accepting…",
    acceptInvitation: "Accept invitation",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_acceptInvitationButton(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
