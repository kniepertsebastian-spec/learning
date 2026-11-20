// Texte von components/SourceUrlInput.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    pasteAddressesHereOneOr: "Adressen hier einfügen (einzeln oder ganze Liste) …",
    noValidAddressFoundStart: "Keine gültige Adresse erkannt (mit https:// beginnen).",
    clearAll: "alle entfernen",
    removeSource: "Quelle entfernen",
    n0AlreadyAdded: "{0} schon vorhanden",
    n0NotAddedMax1: "{0} nicht übernommen (höchstens {1})",
    n0Of1Sources: "{0} von {1} Quellen",
    addFiles: "Dateien hinzufügen",
    filesHint: "oder Dateien hierher ziehen (PDF, Markdown, Text; bis 10 MB)",
    uploading: "Wird hochgeladen …",
    uploadFailed: "{0}: {1}",
    uploadedFile: "Hochgeladene Datei",
    typeNotAllowed: "Dateityp nicht erlaubt",
  },
  en: {
    pasteAddressesHereOneOr: "Paste addresses here (one or a whole list) …",
    noValidAddressFoundStart: "No valid address found (start with https://).",
    clearAll: "clear all",
    removeSource: "Remove source",
    n0AlreadyAdded: "{0} already added",
    n0NotAddedMax1: "{0} not added (max {1})",
    n0Of1Sources: "{0} of {1} sources",
    addFiles: "Add files",
    filesHint: "or drop files here (PDF, Markdown, text; up to 10 MB)",
    uploading: "Uploading …",
    uploadFailed: "{0}: {1}",
    uploadedFile: "Uploaded file",
    typeNotAllowed: "file type not allowed",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_sourceUrlInput(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
