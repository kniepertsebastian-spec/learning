import { beforeEach, describe, expect, it } from "vitest";
import { clearSelfExplanations, getSelfExplanation, MAX_ENTRIES, MAX_LENGTH, saveSelfExplanation } from "./self-explanations";

function fakeStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe("Selbsterklärungen (nur lokal)", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage() };
  });

  it("speichert, liest und ersetzt eine Erklärung je Schlüssel", () => {
    expect(getSelfExplanation("q:1")).toBeNull();
    saveSelfExplanation("q:1", "  Weil DNS Namen auflöst.  ", new Date("2026-10-24T10:00:00Z"));
    expect(getSelfExplanation("q:1")).toEqual({ text: "Weil DNS Namen auflöst.", at: "2026-10-24T10:00:00.000Z" });
    saveSelfExplanation("q:1", "Neuer Text");
    expect(getSelfExplanation("q:1")?.text).toBe("Neuer Text");
  });

  it("ignoriert leere Texte und kürzt auf die Höchstlänge", () => {
    saveSelfExplanation("q:2", "   ");
    expect(getSelfExplanation("q:2")).toBeNull();
    saveSelfExplanation("q:3", "x".repeat(MAX_LENGTH + 50));
    expect(getSelfExplanation("q:3")?.text).toHaveLength(MAX_LENGTH);
  });

  it("behält höchstens MAX_ENTRIES, die ältesten fallen weg", () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) saveSelfExplanation(`q:${i}`, `t${i}`);
    expect(getSelfExplanation("q:0")).toBeNull();
    expect(getSelfExplanation(`q:${MAX_ENTRIES + 4}`)?.text).toBe(`t${MAX_ENTRIES + 4}`);
  });

  it("clear löscht alles; ein kaputter Speicher stört nicht", () => {
    saveSelfExplanation("q:1", "a");
    clearSelfExplanations();
    expect(getSelfExplanation("q:1")).toBeNull();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: () => { throw new Error("blockiert"); }, setItem: () => { throw new Error("blockiert"); }, removeItem: () => { throw new Error("blockiert"); } } };
    expect(() => saveSelfExplanation("q:1", "a")).not.toThrow();
    expect(getSelfExplanation("q:1")).toBeNull();
  });
});
