import { describe, expect, it } from "vitest";
import { collapseSame, lineDiff } from "./diff";

describe("lineDiff", () => {
  it("findet geänderte, neue und gelöschte Zeilen", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
  it("gleiche Texte: nur gleiche Zeilen", () => {
    expect(lineDiff("x\ny", "x\ny").every((l) => l.type === "same")).toBe(true);
  });
  it("fasst ferne unveränderte Zeilen zusammen", () => {
    const lines = lineDiff(["1", "2", "3", "4", "5", "6", "7"].join("\n"), ["1", "2", "3", "4", "5", "6", "X"].join("\n"));
    expect(collapseSame(lines, 1)).toEqual([{ type: "skip", count: 5 }, { type: "same", text: "6" }, { type: "del", text: "7" }, { type: "add", text: "X" }]);
  });
});
