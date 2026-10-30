// Texte von components/lesson/WovenStep.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    aQuickRefresherFromEarlier: "Kurz aufgefrischt: noch eine Frage von früher (zählt nicht für diese Lektion)",
    correct: "richtig",
    wrong: "falsch",
    exactly: "Genau.",
    aStepIsStillMissing: "Hier fehlt noch ein Zwischenschritt.",
  },
  en: {
    aQuickRefresherFromEarlier: "A quick refresher from earlier (does not count for this lesson)",
    correct: "correct",
    wrong: "wrong",
    exactly: "Exactly.",
    aStepIsStillMissing: "A step is still missing here.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_lessonWovenStep(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
