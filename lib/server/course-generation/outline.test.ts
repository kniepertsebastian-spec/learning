import { describe, expect, it } from "vitest";
import { looksLikeOutline } from "./outline";

describe("looksLikeOutline", () => {
  it("reine Stichwortliste: ja", () => {
    expect(looksLikeOutline(["VLAN\n- Access-Port\n- Trunk-Port\n- Native VLAN\n- Tagging 802.1Q\nInter-VLAN-Routing\n- Router-on-a-stick\n- SVI"])).toBe(true);
  });
  it("nummerierte und markdown-Stichpunkte zählen ohne ihre Zeichen", () => {
    expect(looksLikeOutline(["# Netzwerk\n1. Switching\n2. Routing\n3. Firewall\n* NAT\n* ACL"])).toBe(true);
  });
  it("Liste MIT Aussagen: nein", () => {
    expect(
      looksLikeOutline([
        "- Tickets mit Priorität 1 werden binnen einer Stunde vom Bereitschaftsdienst bearbeitet.\n- Änderungen am Produktivsystem brauchen vorher die Freigabe des Change-Managers.\n- Jeder Zugriff auf Kundendaten wird mit Ticketnummer im Log festgehalten.\n- Backups werden jede Nacht gegen 02:00 Uhr auf den zweiten Standort kopiert.",
      ]),
    ).toBe(false);
  });
  it("Fließtext: nein", () => {
    expect(looksLikeOutline(["Ein VLAN trennt einen Switch logisch in mehrere Broadcast-Domänen, sodass Geräte nur mit Teilnehmern desselben VLANs direkt kommunizieren.\nZwischen den VLANs wird über einen Router oder einen Layer-3-Switch vermittelt, der pro VLAN eine Schnittstelle besitzt."])).toBe(false);
  });
  it("zu wenig Zeilen: nein", () => {
    expect(looksLikeOutline(["VLAN\nTrunk"])).toBe(false);
  });
  it("Codezäune und Trennlinien zählen nicht als Zeilen", () => {
    expect(looksLikeOutline(["VLAN\n```\n---\nTrunk\nAccess\nNative"])).toBe(true);
  });
  it("mehrere Texte werden zusammen betrachtet", () => {
    expect(looksLikeOutline(["VLAN\nTrunk", "Access\nNative"])).toBe(true);
  });
});
