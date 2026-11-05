import { describe, expect, it } from "vitest";
import { aggregateSkillCoverage, MIN_TEAM } from "./skill-coverage";

const dep = (id: string, name: string) => ({ id, name });
const people = (department: string | null, n: number, prefix = department ?? "x") => Array.from({ length: n }, (_, i) => ({ userId: `${prefix}${i}`, departmentId: department }));

describe("Skill-Abdeckung je Team", () => {
  it("zählt je Team, wie viele Mitglieder ein Zertifikat haben, im Verhältnis zur ganzen Teamgröße", () => {
    const result = aggregateSkillCoverage({
      departments: [dep("p", "Plattform")],
      members: people("p", 5),
      certificates: [
        { userId: "p0", title: "CKA", vendor: "CNCF" },
        { userId: "p1", title: "cka", vendor: "cncf " }, // gleiche Schreibweise bis auf Groß/Klein und Leerraum
        { userId: "p2", title: "CKA", vendor: "CNCF" },
        { userId: "p0", title: "CKA", vendor: "CNCF" }, // Doppelte zählen eine Person nur einmal
        { userId: "p3", title: "AZ-104", vendor: "Microsoft" },
      ],
    });
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({ department: "Plattform", members: 5 });
    expect(result.teams[0].skills).toEqual([
      { title: "AZ-104", vendor: "Microsoft", holders: 1 },
      { title: "CKA", vendor: "CNCF", holders: 3 },
    ]);
  });

  it("ignoriert Zertifikate von Personen außerhalb des Teams", () => {
    const result = aggregateSkillCoverage({ departments: [dep("p", "Plattform")], members: [...people("p", 3), ...people("q", 3)], certificates: [{ userId: "q0", title: "CKA", vendor: "CNCF" }] });
    expect(result.teams[0].skills).toEqual([]);
  });

  it(`Teams unter ${MIN_TEAM} Mitgliedern erscheinen nicht, nur ihre Zahl; leere Teams zählen nicht`, () => {
    const result = aggregateSkillCoverage({
      departments: [dep("a", "Alpha"), dep("b", "Beta"), dep("c", "Leer")],
      members: [...people("a", MIN_TEAM - 1), ...people("b", MIN_TEAM)],
      certificates: [{ userId: "a0", title: "CKA", vendor: "CNCF" }],
    });
    expect(result.teams.map((t) => t.department)).toEqual(["Beta"]);
    expect(result.hiddenSmallTeams).toBe(1);
  });

  it("keine Rangfolge: Teams und Zertifikate stehen alphabetisch, nicht nach Zahl; Mitglieder ohne Abteilung kommen nicht vor", () => {
    const result = aggregateSkillCoverage({
      departments: [dep("z", "Zebra"), dep("a", "alpha")],
      members: [...people("z", 3), ...people("a", 3), ...people(null, 4, "frei")],
      certificates: [
        { userId: "z0", title: "Zeta", vendor: "V" },
        { userId: "z1", title: "Zeta", vendor: "V" },
        { userId: "z2", title: "Zeta", vendor: "V" },
        { userId: "z0", title: "Alpha-Zert", vendor: "V" },
        { userId: "frei0", title: "Frei", vendor: "V" },
      ],
    });
    expect(result.teams.map((t) => t.department)).toEqual(["alpha", "Zebra"]);
    expect(result.teams[1].skills.map((s) => s.title)).toEqual(["Alpha-Zert", "Zeta"]); // Zeta hat mehr Inhaber, steht trotzdem hinten
    expect(JSON.stringify(result)).not.toContain("frei"); // niemand ohne Team, keine Namen oder Adressen im Ergebnis
    expect(Object.keys(result.teams[0]).sort()).toEqual(["department", "departmentId", "members", "skills"]); // keine Personenliste
  });
});
