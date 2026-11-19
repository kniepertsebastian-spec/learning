import { Card } from "@/components/ui/card";
import { c_companyTeamCoverage } from "@/lib/i18n/components/companyTeamCoverage";
import { fill } from "@/lib/i18n/fill";
import type { SkillCoverage } from "@/lib/company/skill-coverage";
import type { Locale } from "@/lib/types";

/**
 * Skill-Abdeckung je Team, nur aggregiert (docs/roadmaps/archiv/ROADMAP-UI.md, Später). Keine Namen, keine Prozentwerte, keine Reihenfolge nach Zahl:
 * „3 von 5“ je Zertifikat und Team. Die Zahlen liefert getTeamSkillCoverage (nur Freigegebenes der eigenen Firma).
 */
export function TeamSkillCoverage({ coverage, locale }: { coverage: SkillCoverage; locale: Locale }) {
  const tx = c_companyTeamCoverage(locale);
  return (
    <section className="flex flex-col gap-3" data-testid="team-coverage" aria-label={tx.title}>
      <div>
        <h2 className="text-lg font-semibold">{tx.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-subtle">{tx.intro}</p>
      </div>
      {coverage.teams.length === 0 ? (
        <p className="text-sm text-subtle" data-testid="team-coverage-empty">{tx.noTeams}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {coverage.teams.map((team) => (
            <Card key={team.departmentId} data-testid="team-coverage-team">
              <h3 className="font-semibold">{team.department}</h3>
              <p className="text-xs text-subtle">{fill(tx.members, team.members)}</p>
              {team.skills.length === 0 ? (
                <p className="mt-2 text-sm text-subtle">{tx.noSkills}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {team.skills.map((skill) => (
                    <li key={`${skill.title}|${skill.vendor}`} className="flex items-baseline justify-between gap-3" data-testid="team-coverage-skill">
                      <span className="min-w-0 truncate">{skill.title}{skill.vendor ? <span className="text-xs text-faint"> · {skill.vendor}</span> : null}</span>
                      <span className="shrink-0 tabular-nums text-subtle">{fill(tx.holders, skill.holders, team.members)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      {coverage.hiddenSmallTeams > 0 && <p className="text-xs text-subtle">{fill(tx.hidden, coverage.hiddenSmallTeams)}</p>}
    </section>
  );
}
