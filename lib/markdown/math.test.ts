import { describe, expect, it } from "vitest";
import { normalizeMath } from "./math";

describe("Formeln: einheitliche Schreibweise", () => {
  it("ein nacktes \\frac wird zur Formel, auch mit verschachtelten Klammern", () => {
    expect(normalizeMath("Die Rate ist \\frac{a}{b} pro Tag.")).toBe("Die Rate ist $$\\frac{a}{b}$$ pro Tag.");
    expect(normalizeMath("\\frac{x^{2}}{\\frac{1}{2}}")).toBe("$$\\frac{x^{2}}{\\frac{1}{2}}$$");
    expect(normalizeMath("\\dfrac{1}{3}")).toBe("$$\\dfrac{1}{3}$$");
  });
  it("$…$ und \\(…\\) werden zu $$…$$, \\[…\\] zur abgesetzten Formel", () => {
    expect(normalizeMath("Wert $\\frac{a}{b}$ hier")).toBe("Wert $$\\frac{a}{b}$$ hier");
    expect(normalizeMath("Wert \\(x^2\\) hier")).toBe("Wert $$x^2$$ hier");
    expect(normalizeMath("A \\[ \\frac{1}{2} \\] B")).toBe("A \n\n$$\n\\frac{1}{2}\n$$\n\n B");
  });
  it("schon fertige $$…$$ bleiben unangetastet (nicht doppelt verpackt)", () => {
    expect(normalizeMath("$$\\frac{a}{b}$$")).toBe("$$\\frac{a}{b}$$");
    expect(normalizeMath("a $$x^2$$ b $$y_1$$")).toBe("a $$x^2$$ b $$y_1$$");
  });
  it("Währungen und normale Dollarzeichen werden nie zur Formel", () => {
    expect(normalizeMath("Das kostet $5 bis $10 im Monat.")).toBe("Das kostet $5 bis $10 im Monat.");
    expect(normalizeMath("Zahle $ 5 und $ 7")).toBe("Zahle $ 5 und $ 7");
    expect(normalizeMath("Preis: $20, später $30")).toBe("Preis: $20, später $30");
  });
  it("Code bleibt Code: Zäune, Backticks und Shell-Variablen", () => {
    const fenced = "```bash\necho $HOME \\frac{a}{b}\n```";
    expect(normalizeMath(fenced)).toBe(fenced);
    expect(normalizeMath("Nutze `echo $a_b$` und \\frac{1}{2}")).toBe("Nutze `echo $a_b$` und $$\\frac{1}{2}$$");
    const both = "Text \\frac{1}{2}\n\n~~~\n\\frac{3}{4}\n~~~\n\nEnde \\frac{5}{6}";
    expect(normalizeMath(both)).toBe("Text $$\\frac{1}{2}$$\n\n~~~\n\\frac{3}{4}\n~~~\n\nEnde $$\\frac{5}{6}$$");
  });
  it("kaputte oder unvollständige Formeln fallen nicht auf: Text bleibt", () => {
    expect(normalizeMath("\\frac{a}")).toBe("\\frac{a}");
    expect(normalizeMath("Nur ein $ Zeichen")).toBe("Nur ein $ Zeichen");
    expect(normalizeMath("ohne Sonderzeichen")).toBe("ohne Sonderzeichen");
  });
});
