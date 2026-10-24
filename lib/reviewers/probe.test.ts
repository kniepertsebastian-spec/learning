import { describe, expect, it } from "vitest";
import { evaluateProbe, nextAttemptAllowedAt, requiredFound, validateProbeSet, type ProbeItemDraft } from "./probe";

const item = (over: Partial<ProbeItemDraft> = {}): ProbeItemDraft => ({
  question: "Frage?",
  options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }, { text: "c", isCorrect: false }, { text: "d", isCorrect: false }],
  explanation: "Weil.",
  plantedError: null,
  ...over,
});
const planted = () => item({ plantedError: { type: "wrong_key", note: "Schlüssel falsch" } });
const set = (total: number, errors: number) => [...Array.from({ length: errors }, planted), ...Array.from({ length: total - errors }, () => item())];

describe("Probe-Satz prüfen", () => {
  it("15 bis 20 Fragen, 4 bis 5 eingebaute Fehler", () => {
    expect(validateProbeSet(set(16, 5))).toEqual([]);
    expect(validateProbeSet(set(15, 4))).toEqual([]);
    expect(validateProbeSet(set(14, 4)).join(" ")).toMatch(/15 bis 20/);
    expect(validateProbeSet(set(21, 4)).join(" ")).toMatch(/15 bis 20/);
    expect(validateProbeSet(set(16, 3)).join(" ")).toMatch(/4 bis 5 eingebaute/);
    expect(validateProbeSet(set(16, 6)).join(" ")).toMatch(/4 bis 5 eingebaute/);
  });
  it("jede Frage: vier Optionen, genau eine richtig, Text und Erklärung; Fehler mit Notiz", () => {
    const base = set(16, 5);
    base[0] = item({ options: base[0].options.slice(0, 3) });
    base[1] = item({ options: base[1].options.map((o) => ({ ...o, isCorrect: true })) });
    base[2] = item({ question: " " });
    base[3] = item({ plantedError: { type: "outdated", note: " " } });
    const problems = validateProbeSet(base).join(" | ");
    expect(problems).toMatch(/Frage 1: genau vier/);
    expect(problems).toMatch(/Frage 2: genau eine Option/);
    expect(problems).toMatch(/Frage 3: Fragetext/);
    expect(problems).toMatch(/Frage 4: Fehlertyp und Notiz/);
  });
});

describe("Auswertung", () => {
  const items = Array.from({ length: 16 }, (_, i) => ({ id: `i${i}`, planted: i < 5 }));
  it("benötigte Treffer: 4 von 5, bei 4 eingebauten alle 4", () => {
    expect(requiredFound(5)).toBe(4);
    expect(requiredFound(4)).toBe(4);
  });
  it("4 von 5 und höchstens 2 Fehlalarme bestehen", () => {
    expect(evaluateProbe(items, ["i0", "i1", "i2", "i3"])).toEqual({ found: 4, plantedTotal: 5, falseAlarms: 0, passed: true });
    expect(evaluateProbe(items, ["i0", "i1", "i2", "i3", "i4", "i10", "i11"])).toMatchObject({ found: 5, falseAlarms: 2, passed: true });
  });
  it("2 von 5 besteht nicht; 3 Fehlalarme auch nicht; nichts melden besteht nicht", () => {
    expect(evaluateProbe(items, ["i0", "i1"]).passed).toBe(false);
    expect(evaluateProbe(items, ["i0", "i1", "i2", "i3", "i10", "i11", "i12"])).toMatchObject({ found: 4, falseAlarms: 3, passed: false });
    expect(evaluateProbe(items, [])).toMatchObject({ found: 0, falseAlarms: 0, passed: false });
  });
  it("doppelte Meldungen zählen einmal; Meldungen zu unbekannten Fragen werden ignoriert", () => {
    expect(evaluateProbe(items, ["i0", "i0", "i1", "i2", "i3", "zzz"])).toMatchObject({ found: 4, falseAlarms: 0, passed: true });
  });
  it("ein Satz ohne eingebaute Fehler kann nicht bestanden werden", () => {
    expect(evaluateProbe([{ id: "a", planted: false }], []).passed).toBe(false);
  });
  it("Wiederholung frühestens nach 30 Tagen", () => {
    expect(nextAttemptAllowedAt(new Date("2026-10-01T10:00:00Z")).toISOString()).toBe("2026-10-31T10:00:00.000Z");
  });
});
