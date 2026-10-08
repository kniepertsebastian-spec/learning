import { describe, expect, it } from "vitest";
import { makePdf } from "./pdf-fixture";
import { cleanFilename, inspectUpload, MAX_DOCUMENT_BYTES } from "./upload";

const j = (...p: string[]) => p.join("");
const SECRET_LINE = j("-----BEGIN ", "PRIVATE KEY-----");
const text = (s: string) => Buffer.from(s, "utf8");

describe("Upload-Prüfung (ohne Datenbank)", () => {
  it("nimmt ein PDF mit Text an und zählt die Seiten", async () => {
    const r = await inspectUpload({
      filename: "Handbuch.pdf", mimeType: "application/pdf",
      data: makePdf([["Willkommen im Betrieb.", "Hier steht die Arbeitsanweisung."], ["Zweite Seite mit genug Text."]]),
    });
    expect(r).toMatchObject({ ok: true, kind: "pdf", pageCount: 2, mimeType: "application/pdf" });
  });

  it("nimmt .txt und .md an (auch ohne oder mit allgemeinem MIME-Typ)", async () => {
    for (const [filename, mimeType, expected] of [
      ["a.txt", "text/plain", "text/plain"], ["b.md", "text/markdown", "text/markdown"], ["c.md", "", "text/markdown"], ["d.txt", "application/octet-stream", "text/plain"],
    ]) {
      const r = await inspectUpload({ filename, mimeType, data: text("# Titel\nNormaler Text ohne Geheimnisse.") });
      expect(r, filename).toMatchObject({ ok: true, kind: "text", mimeType: expected, pageCount: 1 });
    }
  });

  it("lehnt Leeres, Zu Großes, falsche Typen und Typ/Endung-Widersprüche ab", async () => {
    expect(await inspectUpload({ filename: "a.txt", mimeType: "text/plain", data: Buffer.alloc(0) })).toMatchObject({ code: "empty" });
    expect(await inspectUpload({ filename: "a.txt", mimeType: "text/plain", data: Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 97) })).toMatchObject({ code: "too_large" });
    for (const [filename, mimeType] of [["a.exe", "application/octet-stream"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.pdf", "text/plain"], ["a.txt", "application/pdf"], ["kein-ende", "text/plain"]]) {
      expect(await inspectUpload({ filename, mimeType, data: text("Text genug genug") }), filename).toMatchObject({ code: "unsupported_type" });
    }
  });

  it("prüft den Inhalt, nicht nur Endung und MIME-Typ", async () => {
    expect(await inspectUpload({ filename: "fake.pdf", mimeType: "application/pdf", data: text("Das ist gar kein PDF, nur Text genug.") })).toMatchObject({ code: "invalid_content" });
    expect(await inspectUpload({ filename: "bin.txt", mimeType: "text/plain", data: Buffer.from([0x41, 0x00, 0x42]) })).toMatchObject({ code: "invalid_content" });
    expect(await inspectUpload({ filename: "latin.txt", mimeType: "text/plain", data: Buffer.from([0xe4, 0xf6, 0xfc, 0x41]) })).toMatchObject({ code: "invalid_content" });
    expect(await inspectUpload({ filename: "kaputt.pdf", mimeType: "application/pdf", data: text("%PDF-1.4\nkaputt kaputt kaputt kaputt") })).toMatchObject({ ok: false });
  });

  it("lehnt PDFs ohne auswählbaren Text ab (der Scanner könnte sie nicht prüfen)", async () => {
    const r = await inspectUpload({ filename: "scan.pdf", mimeType: "application/pdf", data: makePdf([[""]]) });
    expect(r).toMatchObject({ ok: false, code: "no_text" });
  });

  it("lehnt Dokumente mit Zugangsdaten ab, in PDF und Text, mit Seite und Zeile, ohne den Wert", async () => {
    const pdf = await inspectUpload({
      filename: "x.pdf", mimeType: "application/pdf",
      data: makePdf([["Erste Seite ist harmlos genug."], ["Zweite Seite", SECRET_LINE]]),
    });
    expect(pdf).toMatchObject({ ok: false, code: "secrets_found", findings: [{ kind: "private_key", pageNumber: 2, line: 2 }] });
    const txt = await inspectUpload({ filename: "x.txt", mimeType: "text/plain", data: text(`Zugang\nPasswort: Sommer2024!\n`) });
    expect(txt).toMatchObject({ ok: false, code: "secrets_found", findings: [{ kind: "password_assignment", pageNumber: 1, line: 2 }] });
    expect(JSON.stringify(txt)).not.toContain("Sommer2024");
  });

  it("bestätigte Fehlalarme: bestätigbare Arten gehen durch und werden vermerkt, nicht bestätigbare nie", async () => {
    const file = (body: string) => ({ filename: "x.txt", mimeType: "text/plain", data: text(body) });
    const pass = "Anleitung\nPasswort: Sommer2024!\nEnde";
    // ohne Bestätigung abgelehnt, mit Bestätigung angenommen
    expect(await inspectUpload(file(pass))).toMatchObject({ ok: false, code: "secrets_found" });
    const ok = await inspectUpload(file(pass), { suppressKinds: ["password_assignment"] });
    expect(ok).toMatchObject({ ok: true, suppressed: [{ kind: "password_assignment", pageNumber: 1, line: 2 }] });
    expect(JSON.stringify((ok as { suppressed: unknown }).suppressed)).not.toContain("Sommer2024");
    // eine andere Art bestätigen hilft nicht
    expect(await inspectUpload(file(pass), { suppressKinds: ["url_credentials"] })).toMatchObject({ ok: false });
    // private Schlüssel lassen sich nie bestätigen, auch nicht auf Wunsch
    const key = `Schlüssel\n${SECRET_LINE}`;
    expect(await inspectUpload(file(key), { suppressKinds: ["private_key" as never] })).toMatchObject({ ok: false, code: "secrets_found", findings: [{ kind: "private_key" }] });
    // gemischt: nur der bestätigte Teil verschwindet, der Rest blockiert weiter
    const mixed = await inspectUpload(file(`${pass}\n${SECRET_LINE}`), { suppressKinds: ["password_assignment"] });
    expect(mixed).toMatchObject({ ok: false, findings: [{ kind: "private_key", line: 4 }] });
    expect((mixed as { findings: unknown[] }).findings).toHaveLength(1);
  });

  it("Dateinamen: nur der Name ohne Pfad und Steuerzeichen", () => {
    expect(cleanFilename("..\\..\\etc\\passwd")).toBe("passwd");
    expect(cleanFilename("/tmp/x/Bericht.pdf")).toBe("Bericht.pdf");
    expect(cleanFilename("a\u0000b\nc.txt")).toBe("abc.txt");
    expect(cleanFilename("")).toBe("dokument");
    expect(cleanFilename("x".repeat(500)).length).toBe(200);
  });

  it("nimmt Konfiguration und Skripte an (yml, yaml, py, sh, sql …), egal welchen MIME-Typ der Browser schickt", async () => {
    const yaml = "- hosts: web\n  tasks:\n    - name: nginx\n      apt: name=nginx state=present\n";
    for (const [filename, mimeType] of [
      ["site.yml", "application/x-yaml"], ["compose.yaml", "text/yaml"], ["site.yml", ""], ["backup.py", "text/x-python"], ["deploy.sh", "application/x-sh"],
      ["deploy.sh", "application/octet-stream"], ["q.sql", "application/sql"], ["conf.toml", "application/toml"], ["Run.PS1", "text/plain"],
    ]) {
      const r = await inspectUpload({ filename, mimeType, data: text(yaml) });
      expect(r, `${filename} ${mimeType}`).toMatchObject({ ok: true, kind: "text", mimeType: "text/plain", pageCount: 1 });
    }
  });
  it("Skripte: Binärdaten, falscher Typ und Zugangsdaten werden abgelehnt", async () => {
    expect(await inspectUpload({ filename: "x.py", mimeType: "text/x-python", data: Buffer.from([0x70, 0x00, 0x71, 0x72]) })).toMatchObject({ code: "invalid_content" });
    expect(await inspectUpload({ filename: "x.py", mimeType: "application/pdf", data: text("print('hallo')") })).toMatchObject({ code: "unsupported_type" });
    expect(await inspectUpload({ filename: "x.py", mimeType: "image/png", data: text("print('hallo')") })).toMatchObject({ code: "unsupported_type" });
    expect(await inspectUpload({ filename: "x.exe", mimeType: "application/octet-stream", data: text("MZ") })).toMatchObject({ code: "unsupported_type" });
    const script = `import os\nKEY = """${SECRET_LINE}\nabc\n-----END PRIVATE KEY-----"""\n`;
    expect(await inspectUpload({ filename: "deploy.py", mimeType: "text/x-python", data: text(script) })).toMatchObject({ code: "secrets_found" });
  });
});
