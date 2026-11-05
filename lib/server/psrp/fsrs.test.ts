import { createEmptyCard, fsrs, generatorParameters, type Grade } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { intervalForStability, retrievability, scheduleReview, type ItemState } from "./fsrs";

const NOW = new Date("2026-03-01T10:00:00Z");
const DAY = 86_400_000;

describe("FSRS-Wrapper (Referenztests)", () => {
  it("bei t = S gilt R ≈ 0.90", () => {
    const state: ItemState = {
      stability: 10, difficulty: 5, reps: 3, lapses: 0, fsrsState: 2,
      lastReview: new Date(NOW.getTime() - 10 * DAY), due: NOW,
    };
    expect(retrievability(state, NOW)).toBeCloseTo(0.9, 2);
  });

  it("S = 14.2, r_ziel = 0.90 → Intervall ≈ 14 Tage", () => {
    expect(intervalForStability(14.2, 0.9)).toBe(14);
  });

  it("Intervall ist nie kleiner als 1 Tag", () => {
    expect(intervalForStability(0.05, 0.9)).toBeGreaterThanOrEqual(1);
    for (const rating of [1, 2, 3, 4] as const) {
      expect(scheduleReview(null, rating, NOW, 0.9).intervalDays).toBeGreaterThanOrEqual(1);
    }
  });

  it("stimmt mit der Bibliothek ohne Wrapper überein", () => {
    const params = generatorParameters({ request_retention: 0.85, enable_fuzz: false, enable_short_term: false });
    const lib = fsrs(params);
    let card = createEmptyCard(NOW);
    let mine: ItemState | null = null;
    let t = NOW;
    for (const rating of [3, 3, 1, 4, 2] as const) {
      card = lib.next(card, t, rating as Grade).card;
      mine = scheduleReview(mine, rating, t, 0.85).state;
      expect(mine.stability).toBeCloseTo(card.stability, 6);
      expect(mine.difficulty).toBeCloseTo(card.difficulty, 6);
      expect(mine.reps).toBe(card.reps);
      expect(mine.lapses).toBe(card.lapses);
      expect(mine.due.getTime()).toBe(card.due.getTime());
      t = card.due;
    }
  });

  it("gleiches Rohrating liefert unabhängig von der Ziel-Retention dieselbe Stabilität", () => {
    const first = scheduleReview(null, 3, NOW, 0.9).state;
    const later = new Date(NOW.getTime() + 5 * DAY);
    const a = scheduleReview(first, 3, later, 0.9).state;
    const b = scheduleReview(first, 3, later, 0.75).state;
    expect(a.stability).toBe(b.stability);
    expect(b.due.getTime()).toBeGreaterThan(a.due.getTime());
  });

  it("niedrigere Ziel-Retention verlängert das Intervall", () => {
    const low = scheduleReview(null, 3, NOW, 0.75).intervalDays;
    const high = scheduleReview(null, 3, NOW, 0.9).intervalDays;
    expect(low).toBeGreaterThanOrEqual(high);
  });
});

/**
 * Referenzwerte, mit ts-fsrs 5.4.2 vor dem Sprung auf ts-fsrs 6 erzeugt (FSRS-6, 21 Gewichte): Der Sprung darf an der
 * Planung nichts ändern. Ändert sich bei einem späteren Update eine dieser Zahlen, ist das eine bewusste Entscheidung
 * (neue Kurve, neues Modell) und keine Versionspflege: dann gehört auch der gespeicherte Stand der Nutzer dazu.
 */
describe("FSRS-Wrapper: Referenzwerte aus ts-fsrs 5.4.2", () => {
  // Ein persönlicher Vektor, wie ihn der Optimizer (Binding 0.5.x) speichert: 21 Werte.
  const personal21 = [
    0.2172, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ];
  const at = (stability: number, days: number): ItemState => ({
    stability, difficulty: 5, reps: 3, lapses: 0, fsrsState: 2,
    lastReview: new Date(NOW.getTime() - days * DAY), due: NOW,
  });

  it("Abrufwahrscheinlichkeit", () => {
    expect(retrievability(at(10, 10), NOW)).toBe(0.9);
    expect(retrievability(at(0.3, 3), NOW)).toBe(0.69282664);
    expect(retrievability(at(300, 400), NOW)).toBe(0.87905151);
    expect(retrievability(at(5, 0.5), NOW)).toBe(0.98568241);
    expect(retrievability(at(1, 0), NOW)).toBe(1);
    expect(retrievability(at(5, 3), NOW, { weights: personal21 })).toBe(retrievability(at(5, 3), NOW));
  });

  it("Intervall in Tagen: ganze Tage, mindestens 1, höchstens 36500", () => {
    expect(intervalForStability(0.05, 0.9)).toBe(1);
    expect(intervalForStability(14.2, 0.9)).toBe(14);
    expect(intervalForStability(90, 0.8)).toBe(298);
    expect(intervalForStability(400, 0.95)).toBe(161);
    expect(intervalForStability(5000, 0.95)).toBe(2013);
    expect(intervalForStability(80000, 0.9)).toBe(36500);
    expect(intervalForStability(90, 0.8, { weights: personal21 })).toBe(298);
  });

  it("vier Reviews hintereinander (Standardgewichte, Ziel 0,9, jeweils pünktlich)", () => {
    let state: ItemState | null = null;
    let t = NOW;
    const seen: Array<{ s: number; d: number; iv: number; pr: number | null }> = [];
    for (const rating of [3, 3, 3, 3] as const) {
      const r = scheduleReview(state, rating, t, 0.9);
      seen.push({ s: r.state.stability, d: r.state.difficulty, iv: r.intervalDays, pr: r.predictedR });
      state = r.state;
      t = state.due;
    }
    expect(seen).toEqual([
      { s: 2.3065, d: 2.11810397, iv: 3, pr: null },
      { s: 13.82690327, d: 2.11121424, iv: 14, pr: 0.88094796 },
      { s: 56.95670978, d: 2.1043314, iv: 57, pr: 0.899143 },
      { s: 196.23528243, d: 2.09745544, iv: 196, pr: 0.89994779 },
    ]);
  });

  it("Vergessen und Wiederholen mit persönlichen Gewichten (Ziel 0,75, nach dem halben Intervall)", () => {
    let state: ItemState | null = null;
    let t = NOW;
    const seen: Array<{ s: number; d: number; lapses: number; iv: number; pr: number | null }> = [];
    for (const rating of [2, 1, 3, 3] as const) {
      const r = scheduleReview(state, rating, t, 0.75, { weights: personal21 });
      seen.push({ s: r.state.stability, d: r.state.difficulty, lapses: r.state.lapses, iv: r.intervalDays, pr: r.predictedR });
      state = r.state;
      t = new Date(t.getTime() + Math.max(1, Math.round(r.intervalDays / 2)) * DAY);
    }
    expect(seen).toEqual([
      { s: 1.2931, d: 5.11217071, lapses: 0, iv: 7, pr: null },
      { s: 0.45012466, d: 8.37863212, lapses: 1, iv: 3, pr: 0.80652839 },
      { s: 2.19420564, d: 8.36548186, lapses: 1, iv: 12, pr: 0.77199444 },
      { s: 7.33616834, d: 8.35234475, lapses: 1, iv: 41, pr: 0.81796163 },
    ]);
  });

  it("ein Gewichtsvektor mit falscher Länge (z. B. 34 Werte aus FSRS-7) fällt auf die Standardwerte zurück, statt zu werfen", () => {
    const bogus34 = Array.from({ length: 34 }, (_, i) => 0.1 + i * 0.05);
    const plain = scheduleReview(null, 3, NOW, 0.9);
    expect(scheduleReview(null, 3, NOW, 0.9, { weights: bogus34 })).toEqual(plain);
    expect(intervalForStability(14.2, 0.9, { weights: bogus34 })).toBe(14);
    expect(retrievability(at(10, 10), NOW, { weights: bogus34 })).toBe(0.9);
  });
});
