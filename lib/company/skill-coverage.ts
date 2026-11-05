/**
 * Skill-Abdeckung je Team (docs/roadmaps/ROADMAP-UI.md, Später), reine Zusammenfassung ohne Datenbank. Leitplanken („kein Talent-Score, keine
 * Vergleiche“): nur **aggregiert** („3 von 5 im Team haben CKA“), nie ein Raster aus Personen und Fähigkeiten, nie als Rangfolge oder Prozentwert;
 * Teams und Zertifikate stehen alphabetisch, nicht nach Zahl. Teams mit weniger als MIN_TEAM Mitgliedern erscheinen nicht (die Zahl wäre fast
 * eine Aussage über eine einzelne Person). Es zählen nur Zertifikate, die die Person der Firma selbst freigegeben hat und die noch gelten.
 */

export const MIN_TEAM = 3;

export interface CoverageSkill {
  title: string;
  vendor: string;
  /** Mitglieder des Teams mit diesem gültigen, freigegebenen Zertifikat. */
  holders: number;
}

export interface CoverageTeam {
  departmentId: string;
  department: string;
  /** Alle Mitglieder des Teams, auch die, die nichts freigegeben haben (sie stehen im Nenner). */
  members: number;
  skills: CoverageSkill[];
}

export interface SkillCoverage {
  teams: CoverageTeam[];
  /** Teams unter MIN_TEAM Mitgliedern, die nicht gezeigt werden (nur die Zahl). */
  hiddenSmallTeams: number;
}

const key = (title: string, vendor: string) => `${title.trim().toLowerCase()}\u0000${vendor.trim().toLowerCase()}`;
const collator = new Intl.Collator(["de", "en"], { sensitivity: "base", numeric: true });

export function aggregateSkillCoverage(input: {
  departments: ReadonlyArray<{ id: string; name: string }>;
  members: ReadonlyArray<{ userId: string; departmentId: string | null }>;
  /** Bereits gefiltert auf freigegebene und noch gültige Zertifikate. */
  certificates: ReadonlyArray<{ userId: string; title: string; vendor: string }>;
}): SkillCoverage {
  const teams: CoverageTeam[] = [];
  let hiddenSmallTeams = 0;
  for (const department of input.departments) {
    const memberIds = new Set(input.members.filter((m) => m.departmentId === department.id).map((m) => m.userId));
    if (memberIds.size === 0) continue;
    if (memberIds.size < MIN_TEAM) {
      hiddenSmallTeams++;
      continue;
    }
    const byKey = new Map<string, { title: string; vendor: string; holders: Set<string> }>();
    for (const cert of input.certificates) {
      if (!memberIds.has(cert.userId)) continue;
      const k = key(cert.title, cert.vendor);
      const entry = byKey.get(k) ?? { title: cert.title.trim(), vendor: cert.vendor.trim(), holders: new Set<string>() };
      entry.holders.add(cert.userId);
      byKey.set(k, entry);
    }
    const skills = [...byKey.values()].map((e) => ({ title: e.title, vendor: e.vendor, holders: e.holders.size })).sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.vendor, b.vendor));
    teams.push({ departmentId: department.id, department: department.name, members: memberIds.size, skills });
  }
  teams.sort((a, b) => collator.compare(a.department, b.department));
  return { teams, hiddenSmallTeams };
}
