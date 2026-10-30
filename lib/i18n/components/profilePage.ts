// Texte von app/profile/page.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    due: "Frist",
    lastPassed: "zuletzt bestanden",
    myProfile: "Mein Profil",
    howILearn: "Wie ich lerne",
    accountData: "Konto & Daten",
    myProgress: "Mein Fortschritt",
    yourCompanySCourses: "Kurse deiner Firma",
    theseAreTheCoursesYour: "Das sind die Kurse, die deine Firma dir bereitgestellt hat. Deine Firma sieht dazu nur Status und Daten, keine Ergebnisse oder Antworten.",
    yourCompanyHasNotProvided: "Deine Firma hat dir noch keinen Kurs bereitgestellt.",
    youDoNotBelongTo: "Du gehörst keiner Firma an.",
    completed0: "Absolviert ({0})",
    open0: "Offen ({0})",
  },
  en: {
    due: "Due",
    lastPassed: "last passed",
    myProfile: "My profile",
    howILearn: "How I learn",
    accountData: "Account & data",
    myProgress: "My progress",
    yourCompanySCourses: "Your company's courses",
    theseAreTheCoursesYour: "These are the courses your company provided. Your company only sees status and dates, never results or answers.",
    yourCompanyHasNotProvided: "Your company has not provided any course yet.",
    youDoNotBelongTo: "You do not belong to a company.",
    completed0: "Completed ({0})",
    open0: "Open ({0})",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_profilePage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
