import { describe, expect, it } from "vitest";
import { computeEngagement, computeEngagementByFlag, computeEngagementByGroup, type EngagementUser } from "./engagement-metrics";

const asOf = new Date("2026-10-31T12:00:00Z");
const user = (over: Partial<EngagementUser> & { sessionDays: string[] }): EngagementUser => ({ userHash: "u", group: "vanilla", sessions: over.sessionDays.length, exits: 0, deescalatedSessions: 0, courses: [], ...over });

describe("Abbruch nach 7 und 30 Tagen", () => {
  it("zählt nur Personen, die lange genug dabei sind; Abbruch = seitdem keine Session mehr", () => {
    const users = [
      user({ sessionDays: ["2026-10-01", "2026-10-30"] }), // dabei, zuletzt gestern: kein Abbruch
      user({ sessionDays: ["2026-10-01", "2026-10-10"] }), // zuletzt vor 21 Tagen: Abbruch nach 7, nicht nach 30
      user({ sessionDays: ["2026-09-01"] }), // Abbruch nach 7 und 30
      user({ sessionDays: ["2026-10-28"] }), // erst 3 Tage dabei: zählt nicht
      user({ sessionDays: [] }), // nie eine Session: zählt nicht
    ];
    const m = computeEngagement(users, asOf);
    expect(m.users).toBe(4);
    expect(m.churn7).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
    expect(m.churn30).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 }); // nur die Person von September; die vom 10.10. war noch nicht 30 Tage weg
  });
  it("ohne Daten keine Rate statt 0", () => {
    const m = computeEngagement([], asOf);
    expect(m.churn7.rate).toBeNull();
    expect(m.returnAfterPause.rate).toBeNull();
    expect(m.courseCompletion.rate).toBeNull();
    expect(m.exit.perHundredSessions).toBeNull();
  });
});

describe("Rückkehr nach Pause", () => {
  it("beendete Pausen (ab 7 Tagen) gegenüber offenen", () => {
    const users = [
      user({ sessionDays: ["2026-10-01", "2026-10-12", "2026-10-30"] }), // zwei Pausen (11 und 18 Tage), beide beendet, jetzt aktiv
      user({ sessionDays: ["2026-10-01", "2026-10-05"] }), // Lücke 4 Tage: keine Pause; seit 26 Tagen weg: offene Pause
      user({ sessionDays: ["2026-10-29"] }), // aktiv
    ];
    const m = computeEngagement(users, asOf);
    expect(m.returnAfterPause).toMatchObject({ closed: 2, open: 1, numerator: 2, denominator: 3, rate: 2 / 3 });
  });
});

describe("Abschluss, Notausstieg, Entlastung", () => {
  it("Kursabschlussquote über Kurse mit begonnener Lernreihe", () => {
    const users = [
      user({ sessionDays: ["2026-10-01"], courses: [{ done: 10, total: 10 }, { done: 3, total: 10 }] }),
      user({ sessionDays: ["2026-10-02"], courses: [{ done: 5, total: 8 }, { done: 0, total: 0 }] }), // Kurs ohne Lektionen zählt nicht
    ];
    expect(computeEngagement(users, asOf).courseCompletion).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
  });
  it("Notausstieg: Anteil der Personen und Nutzungen je 100 Sessions; Entlastung: Anteil der Personen", () => {
    const users = [
      user({ sessionDays: ["2026-10-01"], sessions: 10, exits: 2, deescalatedSessions: 1 }),
      user({ sessionDays: ["2026-10-02"], sessions: 10 }),
      user({ sessionDays: ["2026-10-03"], sessions: 20, exits: 1 }),
      user({ sessionDays: ["2026-10-04"], sessions: 10 }),
    ];
    const m = computeEngagement(users, asOf);
    expect(m.exit).toMatchObject({ numerator: 2, denominator: 4, rate: 0.5 });
    expect(m.exit.perHundredSessions).toBeCloseTo((3 / 50) * 100);
    expect(m.deescalation).toEqual({ numerator: 1, denominator: 4, rate: 0.25 });
  });
  it("je Gruppe getrennt", () => {
    const users = [user({ sessionDays: ["2026-09-01"], group: "vanilla" }), user({ sessionDays: ["2026-10-30"], group: "planning" })];
    const r = computeEngagementByGroup(users, asOf);
    expect(r.all.users).toBe(2);
    expect(Object.keys(r.byGroup).sort()).toEqual(["planning", "vanilla"]);
    expect(r.byGroup.vanilla!.churn7.rate).toBe(1);
    expect(r.byGroup.planning!.churn7.rate).toBeNull();
  });
});

describe("je Feature-Flag", () => {
  it("trennt Personen mit und ohne Flag; ohne Kontrollgruppe bleibt die Seite „ohne“ leer", () => {
    const users = [
      user({ userHash: "a", sessionDays: ["2026-09-01"], flags: { exit_with_win: true, reactivation: true } }),
      user({ userHash: "b", sessionDays: ["2026-10-30"], flags: { exit_with_win: false, reactivation: true } }),
      user({ userHash: "c", sessionDays: ["2026-10-29"] }), // ohne Angabe: gilt als an
    ];
    const byFlag = computeEngagementByFlag(users, asOf);
    expect(byFlag.exit_with_win.enabled.users).toBe(2);
    expect(byFlag.exit_with_win.disabled.users).toBe(1);
    expect(byFlag.exit_with_win.enabled.churn7).toEqual({ numerator: 1, denominator: 1, rate: 1 }); // nur a ist lange genug dabei und seitdem weg
    expect(byFlag.exit_with_win.disabled.churn7.rate).toBeNull(); // b ist erst einen Tag dabei: zählt nicht
    expect(byFlag.reactivation.disabled.users).toBe(0);
    expect(byFlag.reactivation.disabled.churn7.rate).toBeNull();
    expect(Object.keys(byFlag)).toHaveLength(8);
  });
});
