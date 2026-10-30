// Texte von app/unsubscribe/reactivation/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    noMoreReminders: "Keine Erinnerungen mehr",
    thisLinkIsNotValid: "Dieser Link ist ungültig. Du kannst die Erinnerungen auch in deinem Konto abschalten.",
  },
  en: {
    noMoreReminders: "No more reminders",
    thisLinkIsNotValid: "This link is not valid. You can also switch the reminders off in your account.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_unsubscribeReactivationPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
