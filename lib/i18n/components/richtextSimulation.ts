// Texte von components/richtext/Simulation.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    explainInOneSentenceWhy: "Erkläre in einem Satz, warum dieser Weg zum Ziel geführt hat.",
  },
  en: {
    explainInOneSentenceWhy: "Explain in one sentence why this path led to the goal.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_richtextSimulation(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
