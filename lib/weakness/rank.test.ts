import { describe, expect, it } from "vitest";
import { rankWeaknesses, type LatestAnswer } from "./rank";

const a = (objective: string, question: string, isCorrect: boolean): LatestAnswer => ({ objectiveId: objective, objectiveCode: objective, objectiveTitle: `Thema ${objective}`, questionId: question, isCorrect });

describe("Schwächen-Radar", () => {
  it("zeigt höchstens die drei Themen mit den meisten noch falschen Fragen", () => {
    const rows = [
      a("1.1", "q1", false), a("1.1", "q2", false), a("1.1", "q3", true),
      a("1.2", "q4", false), a("1.2", "q5", true),
      a("1.3", "q6", false), a("1.3", "q7", false), a("1.3", "q8", false),
      a("1.4", "q9", false),
    ];
    const top = rankWeaknesses(rows);
    expect(top.map((t) => t.code)).toEqual(["1.3", "1.1", "1.4"]); // 1.4 vor 1.2: gleich viele falsche, aber der größere Anteil
    expect(top[0]).toMatchObject({ wrong: 3, answered: 3 });
  });
  it("Gleichstand: der größere Anteil falscher Fragen zuerst, dann die Nummer", () => {
    const top = rankWeaknesses([a("2.1", "q1", false), a("2.1", "q2", true), a("1.5", "q3", false), a("1.5", "q4", false), a("1.5", "q5", true), a("1.5", "q6", true), a("3.1", "q7", false), a("3.1", "q8", false)]);
    expect(top.map((t) => t.code)).toEqual(["3.1", "1.5", "2.1"]);
  });
  it("Themen ohne falsche Frage erscheinen nicht; ohne Antworten ist die Liste leer", () => {
    expect(rankWeaknesses([a("1.1", "q1", true), a("1.1", "q2", true)])).toEqual([]);
    expect(rankWeaknesses([])).toEqual([]);
  });
  it("je Frage zählt nur eine Antwort (die zuerst gelieferte = die letzte)", () => {
    expect(rankWeaknesses([a("1.1", "q1", true), a("1.1", "q1", false)])).toEqual([]);
    expect(rankWeaknesses([a("1.1", "q1", false), a("1.1", "q1", true)]).map((t) => t.wrong)).toEqual([1]);
  });
  it("Zahlen zur Grenze", () => {
    expect(rankWeaknesses([a("1.1", "q1", false), a("1.2", "q2", false)], 1)).toHaveLength(1);
  });
});
