// Texte von components/SimulationsOverview.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    of: "von",
    solved: "gelöst",
    nextOpen: "Nächste offene",
    practiseAgain: "Noch einmal üben",
    filter: "Filter",
    all: "Alle",
    noSimulationIsUnlockedYet: "Noch ist keine Simulation freigeschaltet. Sie erscheinen hier, sobald du das jeweilige Kapitel abgeschlossen hast.",
    noSimulationsInThisSelection: "Keine Simulationen in dieser Auswahl.",
    stillLocked: "Noch gesperrt",
    n0SolvedOnlyWithHelp: "{0} nur mit Hilfe gelöst: am besten noch einmal ohne Tipp versuchen.",
    n0SimulationSAfterCompleting: "{0} Simulation(en) nach Abschluss des Kapitels",
  },
  en: {
    of: "of",
    solved: "solved",
    nextOpen: "Next open",
    practiseAgain: "Practise again",
    filter: "Filter",
    all: "All",
    noSimulationIsUnlockedYet: "No simulation is unlocked yet. They appear here as soon as you have completed the respective chapter.",
    noSimulationsInThisSelection: "No simulations in this selection.",
    stillLocked: "Still locked",
    n0SolvedOnlyWithHelp: "{0} solved only with help: try them again without hints.",
    n0SimulationSAfterCompleting: "{0} simulation(s) after completing the chapter",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_simulationsOverview(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
