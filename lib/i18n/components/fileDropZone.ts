// Texte von components/FileDropZone.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    dragFilesHereOr: "Dateien hierher ziehen oder",
    dragAFileHereOr: "Datei hierher ziehen oder",
    chooseFiles: "Dateien auswählen",
    chooseFile: "Datei auswählen",
    files: "Dateien",
    remove: "entfernen",
    n0FileTypeNotAllowed: "{0}: Dateityp nicht erlaubt",
    n0LargerThan1Mb: "{0}: größer als {1} MB",
    atMost0FilesThe: "Höchstens {0} Dateien, die übrigen wurden nicht übernommen.",
  },
  en: {
    dragFilesHereOr: "Drag files here or",
    dragAFileHereOr: "Drag a file here or",
    chooseFiles: "Choose files",
    chooseFile: "Choose file",
    files: "Files",
    remove: "remove",
    n0FileTypeNotAllowed: "{0}: file type not allowed",
    n0LargerThan1Mb: "{0}: larger than {1} MB",
    atMost0FilesThe: "At most {0} files, the rest were not added.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_fileDropZone(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
