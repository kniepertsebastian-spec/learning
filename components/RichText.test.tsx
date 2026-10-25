import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "./RichText";

const html = (text: string, inline = false) => renderToStaticMarkup(<RichText text={text} inline={inline} />);

describe("RichText (Fragen, Antworten, Erklärungen)", () => {
  it("Logs und Befehle im Codeblock behalten Zeilenumbrüche und Einrückung", () => {
    const out = html("Was zeigt das Log?\n\n```text\nOct  7 03:12:01 sw1 %LINK-3-UPDOWN: Interface Gi0/1, changed state to down\n  Oct  7 03:12:05 sw1 %SPANTREE-2-BLOCK_PVID_LOCAL: Blocking Gi0/2\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("%LINK-3-UPDOWN");
    expect(out).toMatch(/>\s{2}Oct/); // Einrückung bleibt erhalten
  });
  it("Tabellen (Merkzettel: System, Server) werden als Tabelle mit Rahmen gezeigt, nicht als Textbrei", () => {
    const out = html("| System | Server |\n|---|---|\n| Web | web01 |\n| Backup | backup01 |");
    expect(out).toContain("<table");
    expect(out).toContain("overflow-x-auto");
    expect(out).toMatch(/<th[^>]*border[^>]*>System<\/th>/);
    expect(out).toMatch(/<td[^>]*border[^>]*>backup01<\/td>/);
  });
  it("einzelne Befehle in Backticks als Code", () => {
    expect(html("Welcher Befehl? `ansible-playbook -i hosts site.yml --check`")).toContain("<code");
  });
  it("Antwortknopf (inline): Absatz wird laufender Text, kein Block", () => {
    const out = html("`systemctl restart nginx`", true);
    expect(out).not.toContain("<p");
    expect(out).toContain("<code");
  });
  it("rohes HTML wird nicht ausgeführt, nur als Text gezeigt", () => {
    const out = html("<script>alert(1)</script><img src=x onerror=alert(2)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;"); // nur als Text, nie als Element
  });
  it("Markdown-Bilder entfallen, Links sind keine Links", () => {
    const out = html("![x](https://evil.example/a.png) [klick](https://evil.example)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("href=");
    expect(out).toContain("klick");
  });
  it("normaler Text bleibt normaler Text (auch mit Unterstrichen im Wort)", () => {
    const out = html("Der Wert snake_case_name steht in 2 * 3 Zeilen.");
    expect(out).toContain("snake_case_name");
    expect(out).toContain("2 * 3");
  });
  it("einfache Zeilenumbrüche im Fließtext bleiben sichtbar", () => {
    expect(html("Zeile 1\nZeile 2")).toMatch(/Zeile 1\nZeile 2/);
  });
});

describe("RichText: Formeln und Brüche (KaTeX)", () => {
  it("\\frac wird als Bruch gesetzt (Zähler über Nenner), in allen üblichen Schreibweisen", () => {
    for (const source of ["Rate: $$\\frac{a}{b}$$", "Rate: $\\frac{a}{b}$", "Rate: \\(\\frac{a}{b}\\)", "Rate: \\frac{a}{b}"]) {
      const out = html(source);
      expect(out, source).toContain("katex");
      expect(out, source).toContain("mfrac");
      expect(out.replace(/<annotation[\s\S]*?<\/annotation>/g, ""), source).not.toContain("\\frac"); // der TeX-Quelltext steht nur im MathML-Hinweis
    }
  });
  it("abgesetzte Formeln und Hochstellung", () => {
    const out = html("Vor\n\n\\[ x^{2} + \\frac{1}{2} \\]\n\nNach");
    expect(out).toContain("katex-display");
    expect(out).toContain("msup");
  });
  it("Währungen bleiben Text, Code bleibt Code", () => {
    const out = html("Kostet $5 bis $10. Befehl: `echo $a_b$`");
    expect(out).not.toContain("katex");
    expect(out).toContain("$5 bis $10");
    expect(out).toContain("echo $a_b$");
  });
  it("eine kaputte Formel bricht nicht ab", () => {
    expect(() => html("$$\\frac{a}{$$")).not.toThrow();
  });
});
