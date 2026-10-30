import { describe, expect, it } from "vitest";
import { scanSource } from "./ui-token-scan.mjs";

describe("scanSource", () => {
  it("zählt Hex-Werte und Standardpaletten (auch mit Varianten und Alpha), ignoriert Tokens und Kommentare", () => {
    const code = `
      // bg-red-500 im Kommentar zählt nicht
      /* #ff0000 auch nicht */
      <div className="bg-surface text-foreground border-border bg-accent/10 hover:bg-red-500/10 dark:text-sky-400" style={{ color: "#34e3a4" }} />
      <a href="#abschnitt">Anker</a>
    `;
    expect(scanSource(code)).toEqual({ hex: 1, palette: 2, text: 0 });
  });
  it("kennt keine Verstöße in reinen Token-Klassen", () => {
    expect(scanSource('<p className="text-muted bg-surface-2 rounded-xl border-border-strong text-link" />')).toEqual({ hex: 0, palette: 0, text: 0 });
  });
  it("zählt Inline-Texte, aber keine Sprachcodes", () => {
    const code = 'const a = de ? "Hallo" : "Hello"; const b = locale === "de" ? `${n} Tage` : `${n} days`; const c = de ? "de-DE" : "en-GB";';
    expect(scanSource(code).text).toBe(2);
  });
});
