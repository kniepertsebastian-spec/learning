// Texte der Skill-Abdeckung je Team (components/company/TeamSkillCoverage.tsx) (de/en).
const texts = {
  de: {
    title: "Skill-Abdeckung je Team",
    intro: "Wie viele Mitglieder eines Teams ein Zertifikat haben, das sie der Firma freigegeben haben und das noch gilt. Nur gezählt, nie als Liste von Personen und nie als Vergleich oder Wertung: Teams und Zertifikate stehen alphabetisch. Wer nichts freigegeben hat, steht im Nenner.",
    members: "{0} Mitglieder",
    holders: "{0} von {1}",
    noSkills: "Noch hat niemand in diesem Team ein Zertifikat freigegeben.",
    hidden: "{0} Teams mit weniger als 3 Mitgliedern werden nicht gezeigt (die Zahl wäre fast eine Aussage über eine einzelne Person).",
    noTeams: "Noch kein Team mit mindestens 3 Mitgliedern. Teams legst du im Reiter „Team“ an.",
  },
  en: {
    title: "Skill coverage per team",
    intro: "How many members of a team hold a certificate that they shared with the company and that is still valid. Counted only, never as a list of people and never as a comparison or rating: teams and certificates are listed alphabetically. Members who shared nothing are in the denominator.",
    members: "{0} members",
    holders: "{0} of {1}",
    noSkills: "Nobody in this team has shared a certificate yet.",
    hidden: "{0} teams with fewer than 3 members are not shown (the number would almost be a statement about one person).",
    noTeams: "No team with at least 3 members yet. You create teams in the “Team” tab.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_companyTeamCoverage(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
