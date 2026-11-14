import { describe, expect, it } from "vitest";
import {
  circularSpreadHours,
  computeHumanFactors,
  computeHumanFactorsByGroup,
  MIN_N,
  nightBetween,
  type HumanFactorsReview,
  type HumanFactorsUser,
} from "./human-factors";

const asOf = new Date("2026-11-14T12:00:00Z");
const day = (n: number, hour = 10) => new Date(Date.UTC(2026, 10, n, hour));
const review = (at: Date, over: Partial<HumanFactorsReview> = {}): HumanFactorsReview => ({ at, localHour: at.getUTCHours(), weekday: ((at.getUTCDay() + 6) % 7) + 1, predictedR: 0.9, certificationId: "c1", ...over });
const person = (over: Partial<HumanFactorsUser> = {}): HumanFactorsUser => ({ userHash: "u", group: "planning", timeZone: "Europe/Berlin", weeklyGoalDays: 3, reviews: [], overdueDays: [], exams: [], recallChecks: [], ...over });

describe("circularSpreadHours", () => {
  it("immer dieselbe Uhrzeit ergibt 0", () => {
    expect(circularSpreadHours([9, 9, 9, 9])).toBeCloseTo(0, 6);
  });
  it("23 Uhr und 1 Uhr liegen nah beieinander, nicht 22 Stunden auseinander", () => {
    expect(circularSpreadHours([23, 1, 23, 1])).toBeLessThan(2);
    expect(circularSpreadHours([23, 1, 23, 1])).toBeLessThan(circularSpreadHours([6, 18, 6, 18]) as number);
  });
  it("gleichmäßig über den Tag verteilt ist die Streuung groß", () => {
    expect(circularSpreadHours([0, 6, 12, 18]) as number).toBeGreaterThan(6);
  });
  it("ohne Werte null", () => {
    expect(circularSpreadHours([])).toBeNull();
  });
});

describe("nightBetween", () => {
  it("abends gelernt, morgens abgerufen: eine Nacht dazwischen (Berlin)", () => {
    // 22:00 Berlin = 21:00 UTC (Sommerzeit vorbei: im November UTC+1, also 21:00 UTC), neun Stunden später 07:00 Berlin.
    expect(nightBetween(new Date("2026-11-10T21:00:00Z"), new Date("2026-11-11T06:00:00Z"), "Europe/Berlin")).toBe(true);
  });
  it("vormittags gelernt, nachmittags abgerufen: keine Nacht", () => {
    expect(nightBetween(new Date("2026-11-10T08:00:00Z"), new Date("2026-11-10T15:00:00Z"), "Europe/Berlin")).toBe(false);
  });
  it("die Zeitzone entscheidet: dieselbe Spanne ist in Berlin Nacht, in Tokio nicht", () => {
    const from = new Date("2026-11-10T00:00:00Z");
    const to = new Date("2026-11-10T04:00:00Z");
    // Berlin 01:00 bis 05:00 enthält 03:00; Tokio 09:00 bis 13:00 nicht.
    expect(nightBetween(from, to, "Europe/Berlin")).toBe(true);
    expect(nightBetween(from, to, "Asia/Tokyo")).toBe(false);
  });
  it("ab 24 Stunden Abstand liegt immer eine Nacht dazwischen", () => {
    expect(nightBetween(new Date("2026-11-10T10:00:00Z"), new Date("2026-11-11T10:00:00Z"), "Europe/Berlin")).toBe(true);
  });
  it("eine unbekannte Zeitzone fällt auf UTC zurück statt zu scheitern", () => {
    expect(nightBetween(new Date("2026-11-10T02:00:00Z"), new Date("2026-11-10T04:00:00Z"), "Nirgendwo/Nichts")).toBe(true);
  });
});

describe("4.4 Aufschieben", () => {
  it("Rückstau: je Person der Median, darüber der Median, mit Nenner", () => {
    const m = computeHumanFactors([person({ overdueDays: [1, 3, 5] }), person({ overdueDays: [10] }), person()], asOf).procrastination.backlog;
    expect(m).toMatchObject({ persons: 3, withBacklog: 2, overdueItems: 4 });
    expect(m.medianDaysOverdue).toEqual({ n: 2, small: true, median: 6.5 });
  });

  it("späte Reviews: Anteil unter 0,8 Abrufwahrscheinlichkeit, Reviews ohne Wert zählen nicht", () => {
    const reviews = [0.95, 0.9, 0.7, 0.5, null].map((p, i) => review(day(1 + i), { predictedR: p }));
    const m = computeHumanFactors([person({ reviews })], asOf).procrastination.lateness;
    expect(m).toMatchObject({ numerator: 2, n: 4, share: 0.5, small: true });
    expect(m.medianPredictedR).toBeCloseTo(0.8, 6);
  });

  it("Häufung vor dem Termin: Anteil der letzten Woche an den letzten vier Wochen, nur gleicher Kurs", () => {
    const exam = day(14, 9);
    const reviews = [
      review(day(1)), review(day(5)), // früher (mehr als 7 Tage vor dem Termin um 9 Uhr am 14.)
      review(day(9)), review(day(10)), review(day(11)), review(day(12)), review(day(13)), // letzte Woche (ab 7.11., 9 Uhr)
      review(day(13), { certificationId: "anderer-kurs" }), // zählt nicht
      review(day(15)), // nach dem Termin: zählt nicht
    ];
    const m = computeHumanFactors([person({ reviews, exams: [{ certificationId: "c1", at: exam }] })], new Date("2026-11-20T00:00:00Z")).procrastination.cramming;
    expect(m).toMatchObject({ exams: 1, n: 7, numerator: 5, expectedShare: 0.25 });
    expect(m.share).toBeCloseTo(5 / 7, 6);
  });

  it("ein Termin nach dem Stichtag zählt nicht", () => {
    const m = computeHumanFactors([person({ reviews: [review(day(10))], exams: [{ certificationId: "c1", at: day(30) }] })], asOf).procrastination.cramming;
    expect(m).toMatchObject({ exams: 0, n: 0, share: null });
  });
});

describe("4.5 Regelmäßigkeit", () => {
  it("Streuung der Lernzeit und genutzte Wochentage, erst ab genug Reviews je Person", () => {
    const regular = person({ userHash: "a", reviews: Array.from({ length: 12 }, (_, i) => review(day(1 + (i % 6), 9))) });
    const few = person({ userHash: "b", reviews: [review(day(1)), review(day(2))] });
    const m = computeHumanFactors([regular, few], asOf).regularity;
    expect(m.hourSpreadHours).toMatchObject({ n: 1, small: true });
    expect(m.hourSpreadHours.median).toBeCloseTo(0, 6);
    expect(m.weekdaysUsed.median).toBe(6);
  });

  it("Wochenziel: nur abgeschlossene Wochen, Verhältnis tatsächliche Tage zum Ziel", () => {
    // Wochen ab Montag. 2.11. (Mo) bis 8.11.: 4 Tage; 9.–15.11. ist die laufende Woche (Stichtag 14.11.) und zählt nicht.
    const reviews = [2, 3, 5, 7, 9, 10].map((d) => review(day(d)));
    const m = computeHumanFactors([person({ reviews, weeklyGoalDays: 3 })], asOf).regularity.weeklyGoal;
    expect(m).toMatchObject({ n: 1, numerator: 1, share: 1 });
    expect(m.medianRatio).toBeCloseTo(4 / 3, 6);
  });

  it("Wochen ohne Review zwischen zwei aktiven Wochen zählen als verfehlt", () => {
    const reviews = [day(2), day(3), day(4), day(16 - 14 + 0)].map((d) => review(d)); // 2.,3.,4.11. und 2.11. doppelt: eine Woche
    const early = [review(new Date("2026-10-12T10:00:00Z")), review(new Date("2026-10-13T10:00:00Z")), review(new Date("2026-10-14T10:00:00Z"))];
    const m = computeHumanFactors([person({ reviews: [...early, ...reviews], weeklyGoalDays: 3 })], asOf).regularity.weeklyGoal;
    // Wochen ab 12.10.: 12.10 (3 Tage, erreicht), 19.10 (0), 26.10 (0), 2.11 (3 Tage, erreicht)
    expect(m).toMatchObject({ n: 4, numerator: 2, share: 0.5 });
  });
});

describe("4.11 Schlaf", () => {
  const recall = (hoursAfter: number, correct: number, over: Record<string, unknown> = {}) => ({
    lessonCompletedAt: new Date("2026-11-10T21:00:00Z"), // 22:00 Berlin
    hoursSinceLesson: hoursAfter,
    status: "answered" as const,
    questionCount: 4,
    correctCount: correct,
    ...over,
  });

  it("teilt die Rückblicke nach Nacht dazwischen und gibt die Trefferquote je Seite mit Nenner an", () => {
    const m = computeHumanFactors([person({ recallChecks: [recall(9, 4), recall(9, 3), recall(2, 2), recall(3, 1)] })], asOf).sleep;
    expect(m.withNight).toMatchObject({ n: 2, questions: 8, correct: 7, accuracy: 7 / 8, small: true });
    expect(m.withoutNight).toMatchObject({ n: 2, questions: 8, correct: 3, accuracy: 3 / 8 });
    expect(m.difference).toBeCloseTo(0.5, 6);
  });

  it("übersprungene und unbeantwortete Rückblicke zählen nicht", () => {
    const m = computeHumanFactors([person({ recallChecks: [recall(9, 0, { status: "skipped", correctCount: null }), recall(9, 0, { status: "offered", correctCount: null })] })], asOf).sleep;
    expect(m.withNight.n).toBe(0);
    expect(m.difference).toBeNull();
  });

  it("die Empfehlung ist erst bei genug Rückblicken auf beiden Seiten und belegtem Unterschied sichtbar", () => {
    const many = (hours: number, correct: number, n: number) => Array.from({ length: n }, () => recall(hours, correct));
    // Großer Unterschied, aber zu wenige Rückblicke: nicht belegt.
    expect(computeHumanFactors([person({ recallChecks: [...many(9, 4, 5), ...many(2, 1, 5)] })], asOf).sleep.recommendationSupported).toBe(false);
    // Genug Rückblicke, aber kaum Unterschied: nicht belegt.
    expect(computeHumanFactors([person({ recallChecks: [...many(9, 3, MIN_N), ...many(2, 3, MIN_N)] })], asOf).sleep.recommendationSupported).toBe(false);
    // Genug Rückblicke und deutlicher Unterschied: belegt.
    const supported = computeHumanFactors([person({ recallChecks: [...many(9, 4, MIN_N), ...many(2, 2, MIN_N)] })], asOf).sleep;
    expect(supported.recommendationSupported).toBe(true);
    // Umgekehrter Unterschied (ohne Nacht besser): keine Empfehlung.
    expect(computeHumanFactors([person({ recallChecks: [...many(9, 2, MIN_N), ...many(2, 4, MIN_N)] })], asOf).sleep.recommendationSupported).toBe(false);
  });
});

describe("Gruppen", () => {
  it("liefert die Werte gesamt und je Gruppe, mit eigener Basis je Gruppe", () => {
    const people = [person({ userHash: "a", group: "vanilla", overdueDays: [2] }), person({ userHash: "b", group: "planning", overdueDays: [4] })];
    const m = computeHumanFactorsByGroup(people, asOf);
    expect(m.all.procrastination.backlog.persons).toBe(2);
    expect(m.byGroup.vanilla?.procrastination.backlog.persons).toBe(1);
    expect(m.byGroup.planning?.procrastination.backlog.medianDaysOverdue.median).toBe(4);
  });
});
