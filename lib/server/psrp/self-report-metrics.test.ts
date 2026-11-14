import { describe, expect, it } from "vitest";
import { computeSelfReportMetrics, MIN_N, type QuizOutcome, type RecallOutcome, type SelfReportRow } from "./self-report-metrics";

const row = (over: Partial<SelfReportRow>): SelfReportRow => ({ userKey: "u1", kind: "effort", value: "3", refId: "s1", ...over });

describe("Auswertung der Selbstauskünfte", () => {
  it("zählt gefragt, beantwortet und übersprungen je Art mit Nenner", () => {
    const m = computeSelfReportMetrics([row({ value: "3" }), row({ value: null }), row({ value: null }), row({ kind: "learning_reason", value: "job" })], [], []);
    expect(m.byKind.effort).toMatchObject({ asked: 3, answered: 1, skipped: 2, small: true });
    expect(m.byKind.effort.skipShare).toBeCloseTo(2 / 3, 6);
    expect(m.byKind.retention_forecast).toMatchObject({ asked: 0, skipShare: null });
    expect(m.learningReason).toEqual({ job: 1 });
  });

  it("5.2: Vorhersage gegen das Ergebnis im Rückblick derselben Lektion, überschätzt ab 10 Punkten", () => {
    const rows = [
      row({ kind: "retention_forecast", value: "75", refId: "s1" }), // Rückblick 50 %: Lücke 25
      row({ kind: "retention_forecast", value: "50", refId: "s2" }), // Rückblick 50 %: Lücke 0
      row({ kind: "retention_forecast", value: "100", refId: "s3" }), // kein Rückblick: zählt nicht
      row({ kind: "retention_forecast", value: null, refId: "s4" }), // übersprungen: zählt nicht
    ];
    const recalls: RecallOutcome[] = [
      { userKey: "u1", sectionId: "s1", questionCount: 4, correctCount: 2 },
      { userKey: "u1", sectionId: "s2", questionCount: 2, correctCount: 1 },
      { userKey: "u2", sectionId: "s3", questionCount: 2, correctCount: 2 }, // andere Person
    ];
    const m = computeSelfReportMetrics(rows, recalls, []).retentionForecast;
    expect(m).toMatchObject({ n: 2, small: true, meanForecast: 62.5, meanActual: 50, meanGap: 12.5, overconfident: 1 });
  });

  it("5.1: Ergebnis des ersten Lektionstests nach empfundener Anstrengung", () => {
    const rows = [row({ value: "1", refId: "a" }), row({ value: "2", refId: "b" }), row({ value: "5", refId: "c" }), row({ value: "3", refId: "d" }), row({ value: "4", refId: "e" })];
    const quizzes: QuizOutcome[] = [
      { userKey: "u1", sectionId: "a", score: 100 },
      { userKey: "u1", sectionId: "b", score: 80 },
      { userKey: "u1", sectionId: "c", score: 40 },
      { userKey: "u1", sectionId: "d", score: 70 }, // mittel: zählt in keiner Seite
    ];
    const m = computeSelfReportMetrics(rows, [], quizzes).effort;
    expect(m.easy).toMatchObject({ n: 2, meanScore: 90 });
    expect(m.hard).toMatchObject({ n: 1, meanScore: 40 }); // „e“ hat noch keinen Test
    expect(m.difference).toBe(-50);
  });

  it("ohne Daten gibt es keine Mittelwerte statt Nullen, und ab 20 ist ein Wert nicht mehr klein", () => {
    const empty = computeSelfReportMetrics([], [], []);
    expect(empty.retentionForecast).toMatchObject({ n: 0, meanGap: null });
    expect(empty.effort.difference).toBeNull();
    const many = computeSelfReportMetrics(Array.from({ length: MIN_N }, () => row({})), [], []);
    expect(many.byKind.effort.small).toBe(false);
  });
});
