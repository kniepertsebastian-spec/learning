import { describe, expect, it } from "vitest";
import { fill } from "../fill";
import { c_useSignOut } from "./useSignOut";

describe("Abmelde-Dialog bei nicht übertragenen Ergebnissen", () => {
  it.each(["de", "en"] as const)("sagt auf %s, dass die Ergebnisse auf dem Gerät bleiben und beim nächsten Login übertragen werden", (locale) => {
    const t = c_useSignOut(locale);
    const many = fill(t.unsyncedMany, 3);
    expect(many).toContain("3");
    expect(many).not.toContain("{0}");
    for (const text of [t.unsyncedOne, many]) {
      expect(text).not.toMatch(/verloren|lost/i);
    }
  });

  it("nennt die Gerätespeicherung ausdrücklich", () => {
    expect(c_useSignOut("de").unsyncedOne).toMatch(/bleibt auf diesem Gerät.*nächsten Anmeldung/);
    expect(c_useSignOut("en").unsyncedOne).toMatch(/stays saved on this device.*next time you sign in/);
  });
});
