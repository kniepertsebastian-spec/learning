// Texte von components/CheatSheetBackfill.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    couldNotStart: "Start fehlgeschlagen.",
    anAiAccessIsRequired: "Dafür ist ein KI-Zugang nötig (KI-Zugang einrichten)",
    theLastRunFailed: "Der letzte Lauf ist fehlgeschlagen.",
    cheatSheets0Of1: "Merkzettel: {0} von {1} Lektionen",
    generateThe0Missing: "Fehlende {0} nacherzeugen",
    running0Of1: "läuft … {0} von {1}",
  },
  en: {
    couldNotStart: "Could not start.",
    anAiAccessIsRequired: "An AI access is required",
    theLastRunFailed: "The last run failed.",
    cheatSheets0Of1: "Cheat sheets: {0} of {1} lessons",
    generateThe0Missing: "Generate the {0} missing",
    running0Of1: "running … {0} of {1}",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_cheatSheetBackfill(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
