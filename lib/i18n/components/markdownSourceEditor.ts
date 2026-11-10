// Texte von components/MarkdownSourceEditor.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    edit: "Bearbeiten",
    title: "Titel",
    text: "Markdown-Text",
    save: "Speichern",
    cancel: "Abbrechen",
    loading: "Text wird geladen …",
    loadFailed: "Der Text konnte nicht geladen werden.",
    saveFailed: "Speichern fehlgeschlagen.",
    notEditable: "Diese Quelle ist bereits geprüft oder freigegeben und lässt sich nicht mehr ändern. Lade stattdessen eine neue Ausgabe hoch.",
    saveHint: "Beim Speichern wird der Text neu in Abschnitte zerlegt. Ein vorhandener Blueprint-Vorschlag bleibt, wie er ist, bis du ihn neu extrahierst.",
    savedTitle: "Titel gespeichert.",
    savedAndRead: "Text gespeichert und neu ausgelesen.",
    savedButReadFailed: "Text gespeichert, aber das Auslesen ist fehlgeschlagen: {0}",
    draftIsOutdated: " Der Blueprint-Vorschlag stammt noch vom alten Text. Extrahiere ihn unten neu.",
  },
  en: {
    edit: "Edit",
    title: "Title",
    text: "Markdown text",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading text …",
    loadFailed: "The text could not be loaded.",
    saveFailed: "Saving failed.",
    notEditable: "This source has already been reviewed or approved and can no longer be changed. Upload a new edition instead.",
    saveHint: "Saving splits the text into sections again. An existing blueprint proposal stays as it is until you re-extract it.",
    savedTitle: "Title saved.",
    savedAndRead: "Text saved and read again.",
    savedButReadFailed: "Text saved, but reading it failed: {0}",
    draftIsOutdated: " The blueprint proposal is still based on the old text. Re-extract it below.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_markdownSourceEditor(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
