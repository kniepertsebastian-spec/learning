// Texte von components/admin/workshop/AiAssist.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    priceNotConfigured: "Preis nicht hinterlegt",
    text: ",",
  },
  en: {
    priceNotConfigured: "price not configured",
    text: ".",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminWorkshopAiAssist(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
