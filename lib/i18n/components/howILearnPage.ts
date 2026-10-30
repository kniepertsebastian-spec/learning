// Texte von app/how-i-learn/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    howILearn: "Wie ich lerne",
    extraInputsAreIntroducedStep: "Zusätzliche Eingaben kommen Schritt für Schritt dazu, damit der Start leicht bleibt. Hier kannst du alles jederzeit ein- oder ausschalten.",
    back: "Zurück",
    thisWeek0Of1: "Diese Woche: {0} von {1} Lerntagen.",
  },
  en: {
    howILearn: "How I learn",
    extraInputsAreIntroducedStep: "Extra inputs are introduced step by step to keep the start easy. Here you can switch everything on or off at any time.",
    back: "Back",
    thisWeek0Of1: "This week: {0} of {1} study days.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_howILearnPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
