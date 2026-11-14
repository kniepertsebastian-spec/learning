import { describe, expect, it } from "vitest";
import { classifyErrors, computeErrorTypes, computeErrorTypesByGroup, computeHelpBehavior, type ErrorAttempt, type HelpUser } from "./error-types";
import { fasterThanUsual } from "./error-types-db";

const right = (over: Partial<ErrorAttempt> = {}): ErrorAttempt => ({ shownQuestionId: "q", correct: true, optionId: "ok", sure: false, fast: null, ...over });
const wrong = (optionId: string, over: Partial<ErrorAttempt> = {}): ErrorAttempt => ({ shownQuestionId: "q", correct: false, optionId, sure: false, fast: null, ...over });

describe("Fehlerart (Aufgabe 15, 4.8)", () => {
  it("ohne Fehler keine Einordnung, unter drei Versuchen „unbekannt“", () => {
    expect(classifyErrors([right(), right(), right()])).toBeNull();
    expect(classifyErrors([wrong("a"), wrong("a")])).toBe("unknown");
    expect(classifyErrors([])).toBeNull();
  });

  it("dieselbe falsche Option wiederholt: Fehlvorstellung", () => {
    expect(classifyErrors([wrong("a"), wrong("a"), right()])).toBe("misconception");
    expect(classifyErrors([wrong("a"), wrong("a"), wrong("b")])).toBe("misconception");
  });

  it("dieselbe Option-ID bei verschiedenen gezeigten Fragen zählt nicht als dieselbe Option", () => {
    expect(classifyErrors([wrong("a", { shownQuestionId: "q1" }), wrong("a", { shownQuestionId: "q2" }), wrong("b")])).toBe("gap");
  });

  it("die wiederholte Option muss mindestens die Hälfte der Fehler sein", () => {
    expect(classifyErrors([wrong("a"), wrong("a"), wrong("b"), wrong("c"), wrong("d")])).toBe("gap");
  });

  it("mehrfach „sicher“ falsch: Fehlvorstellung, auch bei wechselnden Optionen", () => {
    expect(classifyErrors([wrong("a", { sure: true }), wrong("b", { sure: true }), right()])).toBe("misconception");
    expect(classifyErrors([wrong("a", { sure: true }), wrong("b"), wrong("c")])).toBe("gap");
  });

  it("wechselnde falsche Optionen: Lücke", () => {
    expect(classifyErrors([wrong("a"), wrong("b"), wrong("c")])).toBe("gap");
    expect(classifyErrors([wrong("a"), wrong("b"), right()])).toBe("gap");
  });

  it("Fehler bei sonst sicherem Stoff mit kurzer Antwortzeit: Flüchtigkeit", () => {
    expect(classifyErrors([right(), right(), wrong("a", { fast: true })])).toBe("slip");
    expect(classifyErrors([right(), right(), right(), right(), wrong("a", { fast: true }), wrong("b", { fast: true })])).toBe("slip");
  });

  it("sicherer Stoff, aber normale Antwortzeit: Lücke; ohne messbare Zeit: unbekannt", () => {
    expect(classifyErrors([right(), right(), wrong("a", { fast: false })])).toBe("gap");
    expect(classifyErrors([right(), right(), wrong("a")])).toBe("unknown");
    expect(classifyErrors([right(), right(), right(), right(), wrong("a", { fast: true }), wrong("b")])).toBe("unknown");
  });

  it("jede Frage mit Fehlern landet in genau einer der vier Klassen", () => {
    const options = [right(), wrong("a"), wrong("b"), wrong("a", { sure: true }), wrong("c", { fast: true }), wrong("a", { fast: false })];
    for (let mask = 1; mask < 1 << options.length; mask++) {
      const attempts = options.filter((_, i) => mask & (1 << i));
      const type = classifyErrors(attempts);
      if (attempts.every((a) => a.correct)) expect(type).toBeNull();
      else expect(["misconception", "gap", "slip", "unknown"]).toContain(type);
    }
  });

  it("zählt je Frage und je Konzept", () => {
    const result = computeErrorTypes([
      { group: "vanilla", question: "Q-1", concepts: ["K1"], attempts: [wrong("a"), wrong("a"), right()] },
      { group: "planning", question: "Q-1", concepts: ["K1"], attempts: [wrong("a"), wrong("b"), wrong("c")] },
      { group: "planning", question: "Q-2", concepts: ["K1", "K2"], attempts: [wrong("a")] },
      { group: "planning", question: "Q-3", concepts: ["K2"], attempts: [right(), right(), right()] },
    ]);
    expect(result.totals).toEqual({ misconception: 1, gap: 1, slip: 0, unknown: 1, questionsWithErrors: 3 });
    expect(result.byQuestion["Q-1"]).toMatchObject({ misconception: 1, gap: 1, questionsWithErrors: 2 });
    expect(result.byQuestion["Q-3"]).toBeUndefined();
    expect(result.byConcept.K1).toMatchObject({ misconception: 1, gap: 1, unknown: 1, questionsWithErrors: 3 });
    expect(result.byConcept.K2).toMatchObject({ unknown: 1, questionsWithErrors: 1 });
  });

  it("je Gruppe nur die Summen", () => {
    const result = computeErrorTypesByGroup([
      { group: "vanilla", question: "Q-1", concepts: [], attempts: [wrong("a"), wrong("a"), right()] },
      { group: "planning", question: "Q-1", concepts: [], attempts: [wrong("a")] },
    ]);
    expect(result.byGroup.vanilla).toMatchObject({ misconception: 1, questionsWithErrors: 1 });
    expect(result.byGroup.planning).toMatchObject({ unknown: 1, questionsWithErrors: 1 });
  });

  it("„schneller als üblich“ erst ab stabiler Basiszeit", () => {
    expect(fasterThanUsual(1000, { medianMs: 4000, n: 20 })).toBe(true);
    expect(fasterThanUsual(5000, { medianMs: 4000, n: 20 })).toBe(false);
    expect(fasterThanUsual(1000, { medianMs: 4000, n: 19 })).toBeNull();
    expect(fasterThanUsual(null, { medianMs: 4000, n: 20 })).toBeNull();
  });
});

describe("Hilfe-Verhalten (Aufgabe 15, 4.7)", () => {
  const person = (over: Partial<HelpUser> = {}): HelpUser => ({ group: "vanilla", simulations: [], mentorRequests: 0, skips: [], ...over });

  it("Simulationen: mit Hilfe, früh (beim ersten Lösen) und spät (beim Wiederholen)", () => {
    const result = computeHelpBehavior([
      person({ simulations: [{ concepts: ["K1"], solves: 1, lastHelps: 2 }, { concepts: ["K1"], solves: 1, lastHelps: 0 }] }),
      person({ simulations: [{ concepts: ["K2"], solves: 3, lastHelps: 1 }, { concepts: [], solves: 2, lastHelps: 0 }] }),
    ]);
    expect(result.simulations.solved).toBe(4);
    expect(result.simulations.withHelp).toMatchObject({ numerator: 2, n: 4, share: 0.5, small: true });
    expect(result.simulations.medianHelps).toBe(0.5);
    expect(result.simulations.early).toMatchObject({ numerator: 1, n: 2 });
    expect(result.simulations.late).toMatchObject({ numerator: 1, n: 2 });
    expect(result.byConcept.K1).toEqual({ simulations: 2, simulationsWithHelp: 1, unanswered: 0, exits: 0 });
  });

  it("unterscheidet „sucht Hilfe“ von „überspringt“", () => {
    const result = computeHelpBehavior([
      person({ mentorRequests: 2 }),
      person({ skips: [{ question: "Q-1", concepts: ["K1"], unanswered: 2, exits: 1 }] }),
      person({ simulations: [{ concepts: [], solves: 1, lastHelps: 1 }], skips: [{ question: "Q-1", concepts: ["K1"], unanswered: 0, exits: 1 }] }),
      person(),
    ]);
    expect(result.people.n).toBe(4);
    expect(result.people.seeksHelp.numerator).toBe(2);
    expect(result.people.skips.numerator).toBe(2);
    expect(result.people.both.numerator).toBe(1);
    expect(result.people.neither.numerator).toBe(1);
    expect(result.mentorRequests).toMatchObject({ total: 2, people: { numerator: 1, n: 4 } });
    expect(result.byQuestion["Q-1"]).toEqual({ unanswered: 2, exits: 2 });
    expect(result.byConcept.K1).toMatchObject({ unanswered: 2, exits: 2 });
  });

  it("ohne Daten keine Anteile", () => {
    const result = computeHelpBehavior([]);
    expect(result.simulations.withHelp.share).toBeNull();
    expect(result.simulations.medianHelps).toBeNull();
    expect(result.people.seeksHelp.share).toBeNull();
  });
});
