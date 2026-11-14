/** Aufgabe 12: Drittel einer Sitzung, Werte mit Nenner und die Aussagen für die Person. */
import { describe, expect, it } from "vitest";
import { computeFatigue, computeFatigueByGroup, fatigueStatements, thirdOf, type FatigueSession } from "./fatigue";

/** Sitzung mit `n` Antworten; `wrongFrom`: ab dieser Position falsch; Zeit steigt ab dort auf `slowMs`. */
function session(n: number, wrongFrom = n, fastMs = 4000, slowMs = fastMs, interruptions: FatigueSession["interruptions"] = null): FatigueSession {
  return { answers: Array.from({ length: n }, (_, i) => ({ correct: i < wrongFrom, responseTimeMs: i < wrongFrom ? fastMs : slowMs })), interruptions };
}

describe("thirdOf", () => {
  it("teilt eine Sitzung in drei gleich große Teile", () => {
    expect(Array.from({ length: 9 }, (_, i) => thirdOf(i, 9))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(Array.from({ length: 4 }, (_, i) => thirdOf(i, 4))).toEqual([0, 0, 1, 2]);
    expect(Array.from({ length: 3 }, (_, i) => thirdOf(i, 3))).toEqual([0, 1, 2]);
  });
});

describe("computeFatigue", () => {
  it("Akzeptanz: 200 Reviews liefern Fehlerquote und Antwortzeit je Drittel mit Nenner", () => {
    // 20 Sitzungen zu 10 Fragen; die letzten zwei jeder Sitzung falsch und langsamer.
    const f = computeFatigue(Array.from({ length: 20 }, () => session(10, 8, 4000, 7000)));
    expect(f.sessions).toBe(20);
    expect(f.answers).toBe(200);
    expect(f.medianSessionLength).toBe(10);
    // 10 Antworten: Drittel 0 = Positionen 0-3, 1 = 4-6, 2 = 7-9
    expect(f.thirds.first.errors).toEqual({ numerator: 0, n: 80, small: false, share: 0 });
    expect(f.thirds.second.errors.n).toBe(60);
    expect(f.thirds.third.errors).toMatchObject({ numerator: 40, n: 60 });
    expect(f.thirds.third.medianResponseMs).toBe(7000);
    expect(f.thirds.first.timed).toBe(80);
    expect(f.errorIncrease).toBeCloseTo(40 / 60);
    expect(f.slowdown).toBeCloseTo(7000 / 4000);
  });

  it("Sitzungen unter drei Antworten zählen nicht für die Drittel, ohne Zeit bleibt der Median leer", () => {
    const f = computeFatigue([session(2), { answers: [{ correct: true, responseTimeMs: null }, { correct: false, responseTimeMs: null }, { correct: true, responseTimeMs: null }], interruptions: null }]);
    expect(f.sessions).toBe(1);
    expect(f.thirds.second.errors).toMatchObject({ numerator: 1, n: 1, small: true });
    expect(f.thirds.first.medianResponseMs).toBeNull();
    expect(f.slowdown).toBeNull();
    expect(computeFatigue([]).errorIncrease).toBeNull();
  });

  it("Unterbrechungen: Anteil, Mediane und Trefferquote mit und ohne", () => {
    const f = computeFatigue([
      session(4, 2, 4000, 4000, { count: 2, totalMs: 60_000 }),
      session(4, 4, 4000, 4000, { count: 4, totalMs: 20_000 }),
      session(4, 4, 4000, 4000, { count: 0, totalMs: 0 }),
      session(4),
    ]);
    expect(f.interruptions.measured).toBe(3);
    expect(f.interruptions.interrupted).toMatchObject({ numerator: 2, n: 3, small: true });
    expect(f.interruptions.medianCount).toBe(3);
    expect(f.interruptions.medianSeconds).toBe(40);
    expect(f.interruptions.accuracy.interrupted).toMatchObject({ sessions: 2, answered: 8, correct: 6, accuracy: 0.75 });
    expect(f.interruptions.accuracy.uninterrupted).toMatchObject({ sessions: 1, accuracy: 1 });
  });

  it("je Evaluationsgruppe und gesamt", () => {
    const r = computeFatigueByGroup([
      { group: "vanilla", sessions: [session(3)] },
      { group: "planning", sessions: [session(6), session(6)] },
    ]);
    expect(r.all.sessions).toBe(3);
    expect(r.byGroup.vanilla?.sessions).toBe(1);
    expect(r.byGroup.planning?.answers).toBe(12);
  });
});

describe("fatigueStatements", () => {
  it("ganze Sätze nur bei genug Daten und deutlichem Unterschied", () => {
    const tired = computeFatigue(Array.from({ length: 20 }, () => session(18, 12, 4000, 6000, { count: 1, totalMs: 5000 })));
    expect(fatigueStatements(tired)).toEqual([
      { kind: "more_errors_after", afterQuestions: 12 },
      { kind: "slower_towards_end" },
      { kind: "often_interrupted", interrupted: 20, measured: 20 },
    ]);
    // gleichmäßig: keine Aussage
    expect(fatigueStatements(computeFatigue(Array.from({ length: 20 }, () => session(18, 18, 4000, 4000, { count: 0, totalMs: 0 }))))).toEqual([]);
    // zu wenige Antworten je Drittel
    expect(fatigueStatements(computeFatigue(Array.from({ length: 3 }, () => session(9, 6, 4000, 9000))))).toEqual([]);
  });
});
