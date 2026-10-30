// Texte von components/reviewer/AcceptReviewerInvitation.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    acceptInvitation: "Einladung annehmen",
  },
  en: {
    acceptInvitation: "Accept invitation",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerAcceptReviewerInvitation(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
