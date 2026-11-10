import { describe, expect, it } from "vitest";
import { splitIntoSections } from "./sections";

const paragraph = (n: number) => `${"Satz ".repeat(60)}Absatz ${n}.`;

describe("splitIntoSections", () => {
  it("lässt einen kurzen Text als einen Abschnitt", () => {
    expect(splitIntoSections("# Titel\n\nKurzer Text.")).toEqual([{ locator: "Abschnitt 1", text: "# Titel\n\nKurzer Text." }]);
  });

  it("trennt einen langen Markdown-Text an Überschriften und benennt die Abschnitte danach", () => {
    const text = [`# Einführung\n\n${paragraph(1)}\n\n${paragraph(2)}`, `## Netzwerke\n\n${paragraph(3)}\n\n${paragraph(4)}`, `## Sicherheit\n\n${paragraph(5)}`].join("\n\n");
    const sections = splitIntoSections(text, 1_000, 300);
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.some((s) => s.locator.includes("Netzwerke"))).toBe(true);
    expect(sections.some((s) => s.locator.includes("Sicherheit"))).toBe(true);
    // Nichts geht verloren: jeder Absatz steht in genau einem Abschnitt.
    for (const n of [1, 2, 3, 4, 5]) expect(sections.filter((s) => s.text.includes(`Absatz ${n}.`))).toHaveLength(1);
  });

  it("teilt einen langen Text ohne Überschriften an Absatzgrenzen und hält die Höchstlänge ein", () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(i)).join("\n\n");
    const sections = splitIntoSections(text, 1_000, 300);
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) expect(s.text.length).toBeLessThanOrEqual(1_000 + 400);
  });

  it("teilt eine einzelne Riesenzeile hart", () => {
    const sections = splitIntoSections("x".repeat(2_500), 1_000, 300);
    expect(sections.length).toBe(3);
  });
});
