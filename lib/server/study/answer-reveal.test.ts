import { describe, expect, it } from "vitest";
import { buildAnswerReveal } from "@/lib/server/study/answer-reveal";

const question = { explanation: { de: "Erklärung", en: "Explanation" }, sourceReference: "S. 4" };
const options = [
  { id: "a", orderNum: 0, isCorrect: false, rationale: { de: "Falsch weil", en: "Wrong because" } },
  { id: "b", orderNum: 1, isCorrect: true, rationale: { de: "nicht zeigen", en: "do not show" } },
  { id: "c", orderNum: 2, isCorrect: false, rationale: null },
];

describe("buildAnswerReveal", () => {
  it("erkennt die richtige Antwort", () => {
    const r = buildAnswerReveal(question, options, "b");
    expect(r.isCorrect).toBe(true);
    expect(r.correctOptionId).toBe("b");
  });

  it("erkennt eine falsche Antwort und liefert Begründungen nur für falsche Optionen", () => {
    const r = buildAnswerReveal(question, options, "a");
    expect(r.isCorrect).toBe(false);
    expect(Object.keys(r.rationales)).toEqual(["a"]);
    expect(r.explanation.de).toBe("Erklärung");
  });

  it("wertet eine leere Auswahl als falsch", () => {
    expect(buildAnswerReveal(question, options, "").isCorrect).toBe(false);
  });
});
