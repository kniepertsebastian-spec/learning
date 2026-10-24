import { describe, expect, it } from "vitest";
import { buildPrompt, buildSolution, gradeAnswer, gradeMatching, gradeOrdering, gradeShortAnswer, normalizeShortAnswer, sanitizeAnswer, shuffled, validateAnswerData, type MatchingData, type OrderingData, type ShortAnswerData } from "./answer-formats";

const t = (de: string, en = de) => ({ de, en });
const ordering: OrderingData = { steps: [{ id: "a", text: t("Problem erkennen") }, { id: "b", text: t("Ursache eingrenzen") }, { id: "c", text: t("Lösung umsetzen") }] };
const short: ShortAnswerData = { accepted: ["ipconfig /all", "ipconfig/all"] };
const matching: MatchingData = { pairs: [{ id: "p1", left: t("DNS"), right: t("Namen auflösen") }, { id: "p2", left: t("DHCP"), right: t("Adressen vergeben") }] };

describe("normalizeShortAnswer", () => {
  it("ignoriert Groß/Klein, Leerraum, Ränder und umgebende Anführungszeichen", () => {
    expect(normalizeShortAnswer('  `IPConfig   /ALL` ')).toBe("ipconfig /all");
    expect(normalizeShortAnswer("„Port 443“")).toBe("port 443");
  });
  it("kann Groß/Klein unterscheiden", () => {
    expect(normalizeShortAnswer("Get-Process", true)).toBe("Get-Process");
  });
});

describe("Auswertung", () => {
  it("Reihenfolge: nur die exakte Folge ist richtig, Teilpunkte nur zur Anzeige", () => {
    expect(gradeOrdering(ordering, ["a", "b", "c"])).toEqual({ correct: true, partial: 1 });
    const swapped = gradeOrdering(ordering, ["a", "c", "b"]);
    expect(swapped.correct).toBe(false);
    expect(swapped.partial).toBeCloseTo(1 / 3);
    expect(gradeOrdering(ordering, ["a", "b"]).correct).toBe(false);
  });
  it("Kurzantwort: akzeptierte Varianten nach Normalisierung, leer und falsch nicht", () => {
    expect(gradeShortAnswer(short, " IPCONFIG /all ").correct).toBe(true);
    expect(gradeShortAnswer(short, "ipconfig/ALL").correct).toBe(true);
    expect(gradeShortAnswer(short, "ifconfig").correct).toBe(false);
    expect(gradeShortAnswer(short, "   ").correct).toBe(false);
    expect(gradeShortAnswer({ accepted: ["Get-Process"], caseSensitive: true }, "get-process").correct).toBe(false);
  });
  it("Zuordnung: alle Paare müssen stimmen", () => {
    expect(gradeMatching(matching, { p1: "p1", p2: "p2" }).correct).toBe(true);
    const wrong = gradeMatching(matching, { p1: "p2", p2: "p1" });
    expect(wrong).toEqual({ correct: false, partial: 0 });
    expect(gradeMatching(matching, { p1: "p1" })).toEqual({ correct: false, partial: 0.5 });
  });
  it("gradeAnswer: falsches Format oder fehlende Antwort ist falsch", () => {
    expect(gradeAnswer("ordering", ordering, { kind: "ordering", order: ["a", "b", "c"] }).correct).toBe(true);
    expect(gradeAnswer("ordering", ordering, { kind: "short_answer", text: "x" }).correct).toBe(false);
    expect(gradeAnswer("matching", matching, null).correct).toBe(false);
  });
});

describe("Darstellung", () => {
  it("gemischt, deterministisch je Seed und nie in Lösungsreihenfolge", () => {
    const items = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 40; i++) expect(shuffled(items, `seed-${i}`)).not.toEqual(items);
    expect(shuffled(items, "x")).toEqual(shuffled(items, "x"));
    expect([...shuffled(items, "y")].sort()).toEqual(items);
    expect(shuffled(["a"], "z")).toEqual(["a"]);
    expect(shuffled(["a", "b"], "z")).toEqual(["b", "a"]);
  });
  it("Prompt ohne Lösung, Lösung für die Anzeige", () => {
    const p = buildPrompt("matching", matching, "q1");
    expect(p).toMatchObject({ format: "matching" });
    expect(JSON.stringify(buildPrompt("short_answer", short, "q"))).not.toContain("ipconfig");
    expect(buildSolution("short_answer", short)).toEqual({ format: "short_answer", accepted: short.accepted });
    expect(buildSolution("ordering", ordering).format).toBe("ordering");
  });
});

describe("validateAnswerData", () => {
  it("akzeptiert gültige Daten", () => {
    expect(validateAnswerData("ordering", ordering)).toEqual([]);
    expect(validateAnswerData("short_answer", short)).toEqual([]);
    expect(validateAnswerData("matching", matching)).toEqual([]);
    expect(validateAnswerData("choice", null)).toEqual([]);
  });
  it("meldet Probleme", () => {
    expect(validateAnswerData("ordering", { steps: [ordering.steps[0]] })).toHaveLength(1);
    expect(validateAnswerData("ordering", { steps: [ordering.steps[0], { ...ordering.steps[1], id: "a" }] })).not.toEqual([]);
    expect(validateAnswerData("ordering", { steps: [ordering.steps[0], { id: "x", text: t("Problem erkennen") }] })).not.toEqual([]);
    expect(validateAnswerData("short_answer", { accepted: [] })).toHaveLength(1);
    expect(validateAnswerData("short_answer", { accepted: ["A", " a "] })).not.toEqual([]);
    expect(validateAnswerData("matching", { pairs: [matching.pairs[0], { ...matching.pairs[1], right: matching.pairs[0].right }] })).not.toEqual([]);
    expect(validateAnswerData("matching", null)).toHaveLength(1);
    expect(validateAnswerData("choice", { x: 1 })).toHaveLength(1);
  });
});

describe("sanitizeAnswer", () => {
  it("lässt wohlgeformte Antworten durch und verwirft den Rest", () => {
    expect(sanitizeAnswer({ kind: "ordering", order: ["a", "b"] })).toEqual({ kind: "ordering", order: ["a", "b"] });
    expect(sanitizeAnswer({ kind: "short_answer", text: "x" })).toEqual({ kind: "short_answer", text: "x" });
    expect(sanitizeAnswer({ kind: "matching", matches: { p1: "p2" } })).toEqual({ kind: "matching", matches: { p1: "p2" } });
    expect(sanitizeAnswer(null)).toBeNull();
    expect(sanitizeAnswer("x")).toBeNull();
    expect(sanitizeAnswer({ kind: "ordering", order: "abc" })).toBeNull();
    expect(sanitizeAnswer({ kind: "ordering", order: [1, 2] })).toBeNull();
    expect(sanitizeAnswer({ kind: "short_answer", text: "x".repeat(201) })).toBeNull();
    expect(sanitizeAnswer({ kind: "matching", matches: [] })).toBeNull();
    expect(sanitizeAnswer({ kind: "other" })).toBeNull();
  });

  it("gradeAnswer stürzt bei kaputter Eingabe nicht ab", () => {
    expect(gradeAnswer("ordering", ordering, { kind: "ordering", order: "abc" } as never)).toEqual({ correct: false, partial: 0 });
  });
});
