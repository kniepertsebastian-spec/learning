// Texte von app/admin/salary/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    salaryData: "Gehaltsdaten",
  },
  en: {
    salaryData: "Salary data",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_adminSalaryPage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
