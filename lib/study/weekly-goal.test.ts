import { describe, expect, it } from "vitest";
import { introStage, isWelcomeBack, protectedStreak, weeklyProgress } from "./weekly-goal";

const TZ = "UTC";
// Mittwoch, 21.10.2026
const now = new Date("2026-10-21T12:00:00Z");
const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
const run = (days: string[], light: number[] = []) => protectedStreak({ completedAt: days.map(at), now, timeZone: TZ, lightWeekdays: light });

describe("Wochenziel", () => {
  it("zählt Lerntage der laufenden Woche (Montag bis Sonntag), nicht doppelt", () => {
    const w = weeklyProgress({ completedAt: [at("2026-10-19"), at("2026-10-19"), at("2026-10-20"), at("2026-10-18")], now, timeZone: TZ });
    expect(w).toEqual({ daysLearned: 2, goal: 4, reached: false });
  });

  it("leichte Tage zählen nicht gegen das Ziel", () => {
    expect(weeklyProgress({ completedAt: [], now, timeZone: TZ, lightWeekdays: [0, 6] }).goal).toBe(4);
    expect(weeklyProgress({ completedAt: [], now, timeZone: TZ, lightWeekdays: [0, 1, 2, 6] }).goal).toBe(3);
    expect(weeklyProgress({ completedAt: [], now, timeZone: TZ, lightWeekdays: [0, 1, 2, 3, 4, 5, 6] }).goal).toBe(1);
  });

  it("Ziel erreicht und eigenes Ziel", () => {
    const days = ["2026-10-19", "2026-10-20", "2026-10-21"].map(at);
    expect(weeklyProgress({ completedAt: days, now, timeZone: TZ, goalDays: 3 }).reached).toBe(true);
    expect(weeklyProgress({ completedAt: days, now, timeZone: TZ, goalDays: 5 }).reached).toBe(false);
  });

  it("Tage zählen in der Zeitzone der Person", () => {
    const lateEvening = new Date("2026-10-20T23:30:00Z"); // in Berlin schon der 21.10.
    const berlin = weeklyProgress({ completedAt: [lateEvening], now: new Date("2026-10-25T10:00:00Z"), timeZone: "Europe/Berlin" });
    expect(berlin.daysLearned).toBe(1);
  });
});

describe("Serienschutz", () => {
  it("ein Tag Pause pro Woche bricht die Serie nicht", () => {
    // Mi (heute) gelernt, Di Pause, Mo, So, Sa gelernt
    expect(run(["2026-10-21", "2026-10-19", "2026-10-18", "2026-10-17"])).toBe(4);
  });

  it("heute nicht gelernt ist keine Pause, die Serie läuft weiter", () => {
    expect(run(["2026-10-20", "2026-10-19", "2026-10-18"])).toBe(3);
  });

  it("zwei Pausen innerhalb einer Woche brechen die Serie", () => {
    // Di und So Pause (2 Tage auseinander): die zweite Lücke bricht die Serie, davor Gelerntes zählt nicht mehr
    expect(run(["2026-10-21", "2026-10-19", "2026-10-17", "2026-10-16"])).toBe(2);
  });

  it("leichte Wochentage sind frei", () => {
    // Sa/So leicht: lernt nur Mo bis Fr
    expect(run(["2026-10-21", "2026-10-20", "2026-10-19", "2026-10-16", "2026-10-15"], [0, 6])).toBe(5);
  });

  it("eine längere Lücke setzt zurück, ein einzelner Tag pro Woche nicht", () => {
    expect(run(["2026-10-21", "2026-10-11"])).toBe(1);
    // je eine Pause am 20. und am 13. (7 Tage auseinander): die Serie hält
    expect(run(["2026-10-21", "2026-10-19", "2026-10-18", "2026-10-17", "2026-10-16", "2026-10-15", "2026-10-14", "2026-10-12"])).toBe(8);
  });
});

describe("Willkommen zurück", () => {
  it("ab 7 Tagen Pause, nie ohne frühere Session", () => {
    expect(isWelcomeBack(new Date("2026-10-14T12:00:00Z"), now)).toBe(true);
    expect(isWelcomeBack(new Date("2026-10-15T12:00:00Z"), now)).toBe(false);
    expect(isWelcomeBack(null, now)).toBe(false);
  });
});

describe("Einführung der Zusatz-Eingaben", () => {
  it("erste Session ohne Zusatz-Eingaben", () => {
    expect(introStage(0)).toEqual({ firstSession: true, askConfidence: false, offerCheckin: false });
  });
  it("Sicherheitsangabe ab der 3., Check-in ab der 5. Session", () => {
    expect(introStage(1)).toMatchObject({ firstSession: false, askConfidence: false, offerCheckin: false });
    expect(introStage(2)).toMatchObject({ askConfidence: true, offerCheckin: false });
    expect(introStage(3)).toMatchObject({ askConfidence: true, offerCheckin: false });
    expect(introStage(4)).toMatchObject({ askConfidence: true, offerCheckin: true });
  });
  it("beides jederzeit abschaltbar", () => {
    expect(introStage(10, { askConfidence: false, offerCheckin: false })).toEqual({ firstSession: false, askConfidence: false, offerCheckin: false });
  });
});
