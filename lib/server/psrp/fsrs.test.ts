import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
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
      card = lib.next(card, t, rating as Rating.Good).card;
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
