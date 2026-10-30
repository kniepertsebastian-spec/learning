// Texte von app/cert/[id]/simulations/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    simulations: "Simulationen",
    applyWhatYouVeLearned: "Hier wendest du das Gelernte selbst an. Jede Simulation steht in ihrer Lektion; ein Klick führt direkt dorthin.",
    thisCourseHasNoSimulations: "Dieser Kurs hat noch keine Simulationen.",
  },
  en: {
    simulations: "Simulations",
    applyWhatYouVeLearned: "Apply what you've learned. Each simulation lives in its lesson; one click takes you straight there.",
    thisCourseHasNoSimulations: "This course has no simulations yet.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdSimulationsPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
