/** Aufgabe 13: Schwelle für Durchklicken, Häufung in der Sitzung und geänderte Antworten. */
import { describe, expect, it } from "vitest";
import { computeGuessing, computeGuessingByGroup, isRushed, RUSH_FRACTION, STABLE_BASE_MIN_N } from "./guessing";

const base = (medianMs: number, n = STABLE_BASE_MIN_N) => ({ medianMs, n });

describe("isRushed", () => {
  it("schneller als ein Drittel der Basiszeit, erst bei stabiler Basiszeit", () => {
    expect(RUSH_FRACTION).toBeCloseTo(1 / 3);
    expect(isRushed(1999, base(6000))).toBe(true);
    expect(isRushed(2000, base(6000))).toBe(false);
    expect(isRushed(1000, base(6000, STABLE_BASE_MIN_N - 1))).toBeNull();
    expect(isRushed(null, base(6000))).toBeNull();
    expect(isRushed(1000, undefined)).toBeNull();
  });
});

describe("computeGuessing", () => {
  it("Anteil mit Nenner, Trefferquote je Seite und gehäufte Sitzungen", () => {
    const reviews = [
      // Sitzung a: drei durchgeklickt (gehäuft), eine normal
      ...[true, true, true].map((rushed, i) => ({ sessionId: "a", correct: i === 0, rushed })),
      { sessionId: "a", correct: true, rushed: false },
      // Sitzung b: drei normal, eine nicht beurteilbar
      ...[false, false, false].map(() => ({ sessionId: "b", correct: true, rushed: false })),
      { sessionId: "b", correct: false, rushed: null },
      // Sitzung c: zu wenig beurteilt
      { sessionId: "c", correct: false, rushed: true },
    ];
    const g = computeGuessing(reviews, [
      { changed: true, correct: false },
      { changed: false, correct: true },
      { changed: false, correct: true },
    ]);
    expect(g.rushing.judged).toBe(8);
    expect(g.rushing.rushed).toEqual({ numerator: 4, n: 8, small: true, share: 0.5 });
    expect(g.rushing.accuracy.rushed).toMatchObject({ n: 4, correct: 1, accuracy: 0.25 });
    expect(g.rushing.accuracy.normal).toMatchObject({ n: 4, accuracy: 1 });
    expect(g.rushing.clusteredSessions).toMatchObject({ numerator: 1, n: 2 });
    expect(g.changedAnswer.changed).toMatchObject({ numerator: 1, n: 3 });
    expect(g.changedAnswer.accuracy.changed.accuracy).toBe(0);
    expect(g.changedAnswer.accuracy.unchanged.accuracy).toBe(1);
  });

  it("ohne Daten: Nenner 0 und leere Anteile, je Gruppe getrennt", () => {
    const g = computeGuessing([], []);
    expect(g.rushing.rushed.share).toBeNull();
    expect(g.changedAnswer.changed).toEqual({ numerator: 0, n: 0, small: true, share: null });
    const byGroup = computeGuessingByGroup([
      { group: "vanilla", reviews: [{ sessionId: "s", correct: true, rushed: true }], answers: [] },
      { group: "planning", reviews: [], answers: [{ changed: true, correct: true }] },
    ]);
    expect(byGroup.all.rushing.judged).toBe(1);
    expect(byGroup.byGroup.planning?.changedAnswer.changed.numerator).toBe(1);
  });
});
