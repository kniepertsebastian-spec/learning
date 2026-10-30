// Texte von components/UnsubscribeReactivation.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    doneYouWillNotGet: "Erledigt. Du bekommst keine Erinnerungen dieser Art mehr.",
    afterALongerBreakWe: "Wir schreiben dir nach längerer Pause höchstens dreimal. Möchtest du sie ganz abschalten?",
    unsubscribe: "Abmelden",
    thatDidNotWork: "Das hat nicht geklappt.",
  },
  en: {
    doneYouWillNotGet: "Done. You will not get reminders of this kind any more.",
    afterALongerBreakWe: "After a longer break we write at most three times. Do you want to switch them off completely?",
    unsubscribe: "Unsubscribe",
    thatDidNotWork: "That did not work.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_unsubscribeReactivation(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
