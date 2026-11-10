// Texte von components/BulkSourceImport.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    textExtracted: "Text extrahiert",
    textNotExtracted: "Text nicht extrahiert",
    networkError: "Netzwerkfehler",
    providerForAll: "Anbieter (für alle)",
    publishedDateOptionalForAll: "Veröffentlichungsdatum (optional, für alle)",
    urlsOnePerLine: "Adressen (eine je Zeile)",
    optionallyWithATitleTitle: "Optional mit Titel: „Titel | Adresse“. Ohne Titel wird er aus der Adresse abgeleitet. Zeilen mit # werden ignoriert.",
    filesMultipleAllowed: "PDF- und Markdown-Dateien (mehrere möglich)",
    extractTextRightAway: "Text gleich extrahieren",
    n0SourceSFound: "{0} Quelle(n) erkannt",
    n0DuplicateUrlSIgnored: ", {0} doppelte Adresse(n) ignoriert",
    n0InvalidLineS1: ", {0} ungültige Zeile(n): {1}{2}",
    atMost0AtOnce: " Höchstens {0} auf einmal.",
    done0New1Already: "Fertig: {0} neu, {1} schon vorhanden, {2} fehlgeschlagen.",
  },
  en: {
    textExtracted: "text extracted",
    textNotExtracted: "text not extracted",
    networkError: "Network error",
    providerForAll: "Provider (for all)",
    publishedDateOptionalForAll: "Published date (optional, for all)",
    urlsOnePerLine: "URLs (one per line)",
    optionallyWithATitleTitle: "Optionally with a title: “Title | URL”. Without one it is derived from the URL. Lines starting with # are ignored.",
    filesMultipleAllowed: "PDF and Markdown files (multiple allowed)",
    extractTextRightAway: "Extract text right away",
    n0SourceSFound: "{0} source(s) found",
    n0DuplicateUrlSIgnored: ", {0} duplicate URL(s) ignored",
    n0InvalidLineS1: ", {0} invalid line(s): {1}{2}",
    atMost0AtOnce: " At most {0} at once.",
    done0New1Already: "Done: {0} new, {1} already there, {2} failed.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_bulkSourceImport(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
