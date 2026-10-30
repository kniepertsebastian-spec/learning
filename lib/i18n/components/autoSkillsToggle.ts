// Texte von components/AutoSkillsToggle.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    thatDidNotWork: "Das hat nicht geklappt.",
    addSkillsToMyProfile: "Skills automatisch ins Profil übernehmen",
    afterPassingAFinalExam: "Nach einer bestandenen Abschlussprüfung oder einem Zertifikat kommt der Kurs als Skill in dein Profil (mit Herkunft, jederzeit löschbar). Beim Einschalten werden bisherige Abschlüsse nachgetragen.",
    enabledAdded0SkillS: "Eingeschaltet. {0} Skill(s) aus bisherigen Abschlüssen ergänzt.",
  },
  en: {
    thatDidNotWork: "That did not work.",
    addSkillsToMyProfile: "Add skills to my profile automatically",
    afterPassingAFinalExam: "After passing a final exam or earning a certificate, the course is added to your profile as a skill (with its source, removable at any time). Turning this on also adds earlier completions.",
    enabledAdded0SkillS: "Enabled. Added {0} skill(s) from earlier completions.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_autoSkillsToggle(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
