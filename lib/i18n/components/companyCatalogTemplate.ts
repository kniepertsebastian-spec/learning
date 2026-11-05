// Texte der Katalog-Vorlage im Dialog „Kursgruppe“ (components/company/GroupDialog.tsx) (de/en).
const texts = {
  de: {
    label: "Aus einer Katalog-Gruppe übernehmen",
    none: "Keine Vorlage, selbst zusammenstellen",
    hint: "Füllt Name, Farbe und Kurse aus dem Katalog. Du kannst alles ändern, bevor du speicherst.",
    omitted: "{0} Kurse dieser Katalog-Gruppe sind nicht dabei (nicht zuweisbar oder über der Grenze).",
    count: "{0} Kurse",
  },
  en: {
    label: "Start from a catalog group",
    none: "No template, put it together myself",
    hint: "Fills name, color and courses from the catalog. You can change everything before you save.",
    omitted: "{0} courses of this catalog group are not included (not assignable or over the limit).",
    count: "{0} courses",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_companyCatalogTemplate(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
