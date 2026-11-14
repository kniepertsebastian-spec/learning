// Texte von app/how-i-learn/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    howILearn: "Wie ich lerne",
    extraInputsAreIntroducedStep: "Zusätzliche Eingaben kommen Schritt für Schritt dazu, damit der Start leicht bleibt. Hier kannst du alles jederzeit ein- oder ausschalten.",
    back: "Zurück",
    thisWeek0Of1: "Diese Woche: {0} von {1} Lerntagen.",
    yourSessions: "Deine Sitzungen",
    moreErrorsAfter0: "Nach etwa {0} Fragen machst du mehr Fehler als am Anfang einer Sitzung.",
    slowerTowardsEnd: "Gegen Ende einer Sitzung brauchst du für eine Antwort deutlich länger als am Anfang.",
    oftenInterrupted0Of1: "In {0} von {1} Sitzungen wurdest du mindestens einmal unterbrochen.",
    observationOnly: "Das ist eine Beobachtung aus deinen bisherigen Sitzungen. An deinem Plan ändert sie nichts.",
  },
  en: {
    howILearn: "How I learn",
    extraInputsAreIntroducedStep: "Extra inputs are introduced step by step to keep the start easy. Here you can switch everything on or off at any time.",
    back: "Back",
    thisWeek0Of1: "This week: {0} of {1} study days.",
    yourSessions: "Your sessions",
    moreErrorsAfter0: "After about {0} questions you make more mistakes than at the start of a session.",
    slowerTowardsEnd: "Towards the end of a session you take noticeably longer per answer than at the start.",
    oftenInterrupted0Of1: "In {0} of {1} sessions you were interrupted at least once.",
    observationOnly: "This is an observation from your sessions so far. It does not change your plan.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_howILearnPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
