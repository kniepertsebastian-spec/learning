import { describe, expect, it } from "vitest";
import { flagRows, MIN_GROUP, predictedRecall, rateOf, readinessCalibration, recallEvaluation, understandingSummary, type ExamResultLike, type RecallLike } from "./impact-report";

const exam = (result: "passed" | "failed", lastScore: number | null, ready = false): ExamResultLike => ({ result, readiness: { reached: lastScore ?? 0, ready, lastScore } });
const many = (n: number, f: (i: number) => ExamResultLike) => Array.from({ length: n }, (_, i) => f(i));

describe("Wirkungsbericht: Bereitschaftswert gegen das Prüfungsergebnis", () => {
  it("rateOf zeigt Quoten erst ab MIN_GROUP", () => {
    expect(rateOf(2, MIN_GROUP - 1)).toEqual({ n: MIN_GROUP - 1, hits: 2, rate: null });
    expect(rateOf(3, MIN_GROUP)).toEqual({ n: MIN_GROUP, hits: 3, rate: 0.6 });
  });

  it("Bestehensquote je Bereich des letzten Simulationsergebnisses und je Urteil der Engine", () => {
    const results = [
      ...many(6, (i) => exam(i < 1 ? "passed" : "failed", 40)), // <50: 1 von 6
      ...many(5, (i) => exam(i < 2 ? "passed" : "failed", 70)), // 65–79: 2 von 5
      ...many(10, (i) => exam(i < 9 ? "passed" : "failed", 90, true)), // ≥80: 9 von 10, „bereit“
      exam("passed", null), // ohne Simulation
    ];
    const c = readinessCalibration(results);
    const band = (key: string) => c.byLastScore.find((b) => b.key === key)!.passed;
    expect(c.total).toBe(22);
    expect(band("lt50")).toMatchObject({ n: 6, hits: 1 });
    expect(band("lt50").rate).toBeCloseTo(1 / 6, 6);
    expect(band("65to79")).toMatchObject({ n: 5, hits: 2, rate: 0.4 });
    expect(band("gte80")).toMatchObject({ n: 10, hits: 9, rate: 0.9 });
    expect(band("none")).toEqual({ n: 1, hits: 1, rate: null }); // zu klein
    expect(c.byReady.ready).toMatchObject({ n: 10, hits: 9 });
    expect(c.byReady.notReady).toMatchObject({ n: 12, hits: 4 });
    expect(c.passRate).toMatchObject({ n: 22, hits: 13 });
    expect(c.meanLastScore.passed).toBeGreaterThan(c.meanLastScore.failed!); // wer bestanden hat, lag vorher höher
  });

  it("ohne Daten: keine Quoten, keine Fehler", () => {
    const c = readinessCalibration([]);
    expect(c.total).toBe(0);
    expect(c.passRate.rate).toBeNull();
    expect(c.meanLastScore).toEqual({ passed: null, failed: null });
  });
});

describe("Wirkungsbericht: Rückblick", () => {
  const check = (extra: Partial<RecallLike>): RecallLike => ({ status: "answered", questionCount: 4, correctCount: 3, hoursSinceLesson: 24, phiAtLearning: 0.2, hourAtLearning: 9, ...extra });

  it("predictedRecall folgt der Vergessenskurve: nach null Stunden 1, später kleiner und stets zwischen 0 und 1", () => {
    expect(predictedRecall(0)).toBe(1);
    expect(predictedRecall(24)).toBeLessThan(1);
    expect(predictedRecall(24)).toBeGreaterThan(predictedRecall(24 * 7));
    expect(predictedRecall(-5)).toBe(1);
  });

  it("zählt nur beantwortete Rückblicke und teilt nach Abstand, Tagesform und Tageszeit", () => {
    const rows: RecallLike[] = [
      ...Array.from({ length: 6 }, () => check({})), // 24 h, Φ niedrig, morgens: 3 von 4
      ...Array.from({ length: 5 }, () => check({ hoursSinceLesson: 100, phiAtLearning: 0.9, hourAtLearning: 23, correctCount: 1 })), // spät, belastet, nachts: 1 von 4
      check({ status: "skipped", correctCount: null }),
      check({ status: "offered", correctCount: null }),
    ];
    const e = recallEvaluation(rows);
    expect(e.answered).toBe(11);
    expect(e.overall.questions).toBe(44);
    expect(e.overall.actual).toMatchObject({ hits: 6 * 3 + 5, n: 44 });
    const delay = (k: string) => e.byDelay.find((b) => b.key === k)!;
    expect(delay("24to72h").actual.rate).toBe(0.75);
    expect(delay("gte72h").actual.rate).toBe(0.25);
    expect(delay("lt24h").checks).toBe(0);
    expect(e.byPhiAtLearning.find((b) => b.key === "low")!.actual.rate).toBe(0.75);
    expect(e.byPhiAtLearning.find((b) => b.key === "high")!.actual.rate).toBe(0.25);
    expect(e.byHourAtLearning.find((b) => b.key === "morning")!.actual.rate).toBe(0.75);
    expect(e.byHourAtLearning.find((b) => b.key === "night")!.actual.rate).toBe(0.25);
    // Vorhersage: nach 24 h höher als nach 100 h.
    expect(delay("24to72h").predicted!).toBeGreaterThan(delay("gte72h").predicted!);
  });

  it("zu kleine Gruppen zeigen keine Quote und keine Vorhersage", () => {
    const e = recallEvaluation([check({ questionCount: 2, correctCount: 1 }), check({ questionCount: 2, correctCount: 1 })]); // 4 Fragen: unter MIN_GROUP
    expect(e.overall.actual.rate).toBeNull();
    expect(e.overall.predicted).toBeNull();
    expect(e.overall.checks).toBe(2);
  });
});

describe("Wirkungsbericht: Kennzahlen je Feature-Flag", () => {
  it("zeigt je Flag beide Seiten und den Unterschied in Prozentpunkten, nur bei genug Nutzern", () => {
    const rows = flagRows({
      understanding_mode: { enabled: { users: 12, reviews: 300, retention: 0.9 }, disabled: { users: 20, reviews: 500, retention: 0.84 } },
      think_first: { enabled: { users: 3, reviews: 40, retention: 0.95 }, disabled: { users: 30, reviews: 800, retention: 0.8 } },
      variant_rotation: { enabled: { users: 8, reviews: 10, retention: null, reviewsWithVariant: 2 }, disabled: { users: 8, reviews: 0, retention: null } },
      kaputt: { enabled: 5 },
      nichts: null,
    });
    expect(rows.map((r) => r.flag)).toEqual(["think_first", "understanding_mode", "variant_rotation"]);
    const u = rows.find((r) => r.flag === "understanding_mode")!;
    expect(u.enoughUsers).toBe(true);
    expect(u.differencePoints).toBeCloseTo(6, 6);
    expect(rows.find((r) => r.flag === "think_first")).toMatchObject({ enoughUsers: false, differencePoints: null });
    expect(rows.find((r) => r.flag === "variant_rotation")).toMatchObject({ enoughUsers: true, differencePoints: null });
  });
});

describe("Wirkungsbericht: Verstehens-Modus", () => {
  const day = 86_400_000;
  const t0 = new Date("2026-10-01T10:00:00Z");
  const resolved = (days: number) => ({ status: "resolved" as const, detectedAt: t0, resolvedAt: new Date(t0.getTime() + days * day) });

  it("Anteil gelöst und Dauer bis gelöst", () => {
    const rows = [resolved(1), resolved(2), resolved(3), resolved(4), resolved(10), { status: "declined" as const, detectedAt: t0, resolvedAt: null }, { status: "in_progress" as const, detectedAt: t0, resolvedAt: null }, { status: "detected" as const, detectedAt: t0, resolvedAt: null }];
    const s = understandingSummary(rows);
    expect(s.total).toBe(8);
    expect(s.counts).toEqual({ detected: 1, in_progress: 1, resolved: 5, declined: 1 });
    expect(s.resolved).toMatchObject({ n: 7, hits: 5 }); // „erkannt“ ist noch offen und zählt nicht mit
    expect(s.daysToResolve.median).toBe(3);
    expect(s.daysToResolve.mean).toBe(4);
  });

  it("ohne genug gelöste Fälle keine Dauer", () => {
    expect(understandingSummary([resolved(2)]).daysToResolve).toEqual({ median: null, mean: null });
    expect(understandingSummary([]).resolved.rate).toBeNull();
  });
});
