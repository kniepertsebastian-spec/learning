// Texte von app/cert/[id]/cheatsheets/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    cheatSheets: "Merkzettel",
    printSaveAsPdf: "Drucken / als PDF speichern",
    yourCheatSheetIsStill: "Dein Merkzettel ist noch leer. Er füllt sich Kapitel für Kapitel, sobald du ein Kapitel abgeschlossen hast.",
    thisCourseHasNoCheat: "Zu diesem Kurs gibt es noch keine Merkzettel. Neue Kurse bekommen nach jeder Lektion einen.",
    growsWithYourProgress: "Wächst mit deinem Fortschritt",
    aChapterSKeyPoints: "Die Merksätze eines Kapitels kommen dazu, sobald du es abgeschlossen hast (alle Lektionen durchgearbeitet und das Kapitelquiz bestanden).",
  },
  en: {
    cheatSheets: "Cheat sheets",
    printSaveAsPdf: "Print / save as PDF",
    yourCheatSheetIsStill: "Your cheat sheet is still empty. It fills up chapter by chapter as you complete chapters.",
    thisCourseHasNoCheat: "This course has no cheat sheets yet. New courses get one after every lesson.",
    growsWithYourProgress: "Grows with your progress",
    aChapterSKeyPoints: "A chapter's key points are added once you have completed it (all lessons done and the chapter quiz passed).",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_certIdCheatsheetsPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
