// Texte von app/reviewer/profile/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    myCourse: "Mein Kurs",
    myExpertProfile: "Mein Expertenprofil",
  },
  en: {
    myCourse: "My course",
    myExpertProfile: "My expert profile",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_reviewerProfilePage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
