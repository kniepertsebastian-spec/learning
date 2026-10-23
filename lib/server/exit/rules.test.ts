import { describe, expect, it } from "vitest";
import { pickWinItems } from "./rules";

const now = new Date("2026-10-23T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

describe("Notausstieg: Erfolgsaufgaben", () => {
  it("nimmt nur sichere, bald fällige Aufgaben, höchstens drei, die am ehesten fälligen zuerst", () => {
    const picked = pickWinItems(
      [
        { itemId: "a", retrievability: 0.95, due: inDays(2) },
        { itemId: "b", retrievability: 0.97, due: inDays(0.5) },
        { itemId: "unsicher", retrievability: 0.7, due: inDays(1) },
        { itemId: "zu-spaet", retrievability: 0.99, due: inDays(10) },
        { itemId: "c", retrievability: 0.92, due: inDays(1) },
        { itemId: "d", retrievability: 0.91, due: inDays(2.5) },
      ],
      now,
    );
    expect(picked).toEqual(["b", "c", "a"]);
  });

  it("ohne passende Aufgaben bleibt die Liste leer", () => {
    expect(pickWinItems([{ itemId: "x", retrievability: 0.5, due: inDays(1) }], now)).toEqual([]);
  });
});
