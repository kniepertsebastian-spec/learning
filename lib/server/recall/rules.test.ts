import { describe, expect, it } from "vitest";
import { hoursBetween, pickRecallCandidate } from "@/lib/server/recall/rules";

const now = new Date("2026-10-23T09:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("pickRecallCandidate", () => {
  it("nimmt nichts, was jünger als 24 Stunden oder älter als 14 Tage ist", () => {
    expect(pickRecallCandidate([{ sectionId: "a", completedAt: ago(23) }, { sectionId: "b", completedAt: ago(14 * 24 + 1) }], now, new Set())).toBeNull();
  });
  it("nimmt Lektionen genau an den Fenstergrenzen", () => {
    expect(pickRecallCandidate([{ sectionId: "a", completedAt: ago(24) }], now, new Set())?.sectionId).toBe("a");
    expect(pickRecallCandidate([{ sectionId: "b", completedAt: ago(14 * 24) }], now, new Set())?.sectionId).toBe("b");
  });
  it("nimmt die am längsten zurückliegende zuerst und überspringt bereits abgefragte", () => {
    const candidates = [
      { sectionId: "neu", completedAt: ago(30) },
      { sectionId: "alt", completedAt: ago(200) },
      { sectionId: "mittel", completedAt: ago(100) },
    ];
    expect(pickRecallCandidate(candidates, now, new Set())?.sectionId).toBe("alt");
    expect(pickRecallCandidate(candidates, now, new Set(["alt"]))?.sectionId).toBe("mittel");
  });
});

describe("hoursBetween", () => {
  it("rechnet in Stunden mit zwei Nachkommastellen", () => {
    expect(hoursBetween(ago(26.5), now)).toBe(26.5);
    expect(hoursBetween(new Date("2026-10-22T09:00:00Z"), new Date("2026-10-23T09:20:00Z"))).toBe(24.33);
  });
});
