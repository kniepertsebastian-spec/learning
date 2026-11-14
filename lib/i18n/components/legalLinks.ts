// Texte der Rechtslinks (Fuß, Login, Registrierung). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: { nav: "Rechtliches", privacy: "Datenschutz", imprint: "Impressum", terms: "AGB" },
  en: { nav: "Legal", privacy: "Privacy", imprint: "Imprint", terms: "Terms" },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_legalLinks(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
