import { describe, expect, it } from "vitest";
import { convertStructuredExport, structuredPages, StructuredExportError } from "./structured";
import { inspectUpload } from "./upload";

const j = (...p: string[]) => p.join("");
const buf = (s: string) => Buffer.from(s, "utf8");

const WIKIJS_LIST = JSON.stringify({
  pages: [
    { path: "netz/vlan", title: "VLAN-Konfiguration", content: "# VLANs\n\n- VLAN 10: Server\n- VLAN 20: Clients\n\n```\nswitchport trunk allowed vlan 10,20\n```" },
    { path: "ops/ansible", title: "Ansible Playbooks", content: "Playbooks liegen unter `/opt/ansible/playbooks`. Aufruf: `ansible-playbook site.yml -l web`." },
  ],
});
const WIKIJS_GRAPHQL = JSON.stringify({ data: { pages: { single: { title: "Backup", content: "Backups laufen nachts um 02:00 auf backup01." } } } });
const MEDIAWIKI = `<mediawiki><page><title>Firewall</title><revision><text xml:space="preserve">== Regeln ==
* '''Port 22''' nur aus dem [[Management]]-Netz
* {{Hinweis|Änderungen per Ticket}}</text></revision></page><page><title>Alt</title><redirect title="Firewall"/><revision><text>#REDIRECT [[Firewall]]</text></revision></page></mediawiki>`;
const HTML = `<html><head><title>Runbook</title><style>.x{}</style></head><body><script>alert(1)</script><h1>Datenbank</h1><ul><li>Restart: systemctl restart postgresql</li></ul><table><tr><td>Host</td><td>db01</td></tr></table></body></html>`;

describe("Wiki-/Doku-Exporte", () => {
  it("Wiki.js-JSON mit Seitenliste: eine Seite je Eintrag, Listen und Befehle bleiben erhalten", () => {
    const pages = convertStructuredExport("json", WIKIJS_LIST);
    expect(pages.map((p) => p.title)).toEqual(["VLAN-Konfiguration", "Ansible Playbooks"]);
    expect(pages[0].text).toContain("switchport trunk allowed vlan 10,20");
    expect(pages[1].text).toContain("ansible-playbook site.yml -l web");
  });
  it("GraphQL-Antwort einer einzelnen Wiki.js-Seite", () => {
    const pages = convertStructuredExport("json", WIKIJS_GRAPHQL);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Backup");
    expect(pages[0].text).toContain("02:00");
  });
  it("MediaWiki-XML: Wikitext wird lesbar, Weiterleitungen entfallen", () => {
    const pages = convertStructuredExport("xml", MEDIAWIKI);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Firewall");
    expect(pages[0].text).toContain("Port 22");
    expect(pages[0].text).not.toContain("'''");
    expect(pages[0].text).not.toContain("[[");
  });
  it("HTML: Skript und Stil verschwinden, Tabellen- und Listentext bleibt", () => {
    const [page] = convertStructuredExport("html", HTML);
    expect(page.text).toContain("systemctl restart postgresql");
    expect(page.text).toContain("db01");
    expect(page.text).not.toContain("alert(1)");
  });
  it("kaputte oder leere Exporte werden klar abgelehnt", () => {
    expect(() => convertStructuredExport("json", "{kaputt")).toThrow(StructuredExportError);
    expect(() => convertStructuredExport("json", "{}")).toThrow(StructuredExportError);
    expect(() => convertStructuredExport("xml", "<a></a>")).toThrow(StructuredExportError);
  });
  it("Seitenaufbau ist deterministisch (Scanner und Schwärzung zählen gleich)", () => {
    expect(structuredPages("json", WIKIJS_LIST)).toEqual(structuredPages("json", WIKIJS_LIST));
    expect(structuredPages("json", WIKIJS_LIST)[0].text.startsWith("# VLAN-Konfiguration\n\n")).toBe(true);
  });
});

describe("Upload von Exporten", () => {
  it("nimmt json/xml/html an und speichert den passenden MIME-Typ", async () => {
    for (const [filename, mimeType, data, stored, pages] of [
      ["wiki.json", "application/json", WIKIJS_LIST, "application/json", 2],
      ["wiki.xml", "text/xml", MEDIAWIKI, "application/xml", 1],
      ["seite.html", "text/html", HTML, "text/html", 1],
      ["seite.htm", "", HTML, "text/html", 1],
    ] as const) {
      const r = await inspectUpload({ filename, mimeType, data: buf(data) });
      expect(r, filename).toMatchObject({ ok: true, kind: "export", mimeType: stored, pageCount: pages });
    }
  });
  it("lehnt falschen Typ, ungültigen Inhalt und Geheimnisse im konvertierten Text ab", async () => {
    expect(await inspectUpload({ filename: "a.json", mimeType: "application/pdf", data: buf(WIKIJS_LIST) })).toMatchObject({ code: "unsupported_type" });
    expect(await inspectUpload({ filename: "a.json", mimeType: "application/json", data: buf("{kaputt") })).toMatchObject({ code: "unreadable" });
    const secret = JSON.stringify({ title: "Zugang", content: j("Deploy:\n-----BEGIN ", "PRIVATE KEY-----\nabc") });
    expect(await inspectUpload({ filename: "s.json", mimeType: "application/json", data: buf(secret) })).toMatchObject({ code: "secrets_found" });
  });
});
