// Texte von components/shell/CommandPalette.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    open: "Suchen",
    shortcut: "⌘K",
    title: "Suche und Schnellzugriff",
    description: "Mit den Pfeiltasten wählen, mit Enter öffnen, mit Escape schließen.",
    placeholder: "Kurse, Abschnitte, Befehle und Seiten suchen …",
    close: "Schließen",
    groupPages: "Seiten",
    groupCourses: "Kurse",
    groupSections: "Abschnitte",
    groupCommands: "Befehle aus Merkzetteln",
    hint: "Mindestens zwei Zeichen eingeben, um Kurse, Abschnitte und Befehle zu suchen.",
    searching: "Suche läuft …",
    empty: "Nichts gefunden.",
    error: "Die Suche ist gerade nicht erreichbar.",
    results: "{0} Treffer",
  },
  en: {
    open: "Search",
    shortcut: "⌘K",
    title: "Search and quick access",
    description: "Use the arrow keys to choose, Enter to open, Escape to close.",
    placeholder: "Search courses, sections, commands and pages …",
    close: "Close",
    groupPages: "Pages",
    groupCourses: "Courses",
    groupSections: "Sections",
    groupCommands: "Commands from cheat sheets",
    hint: "Type at least two characters to search courses, sections and commands.",
    searching: "Searching …",
    empty: "Nothing found.",
    error: "Search is not available right now.",
    results: "{0} results",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_commandPalette(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
