import { describe, expect, it } from "vitest";
import { hardNavigationTarget } from "@/lib/client/offline-nav";

const base = { href: "/offline", target: null, download: false, button: 0, modified: false, defaultPrevented: false };
const origin = "https://app.example";

describe("hardNavigationTarget", () => {
  it("führt interne Links offline als harte Navigation aus", () => {
    expect(hardNavigationTarget(base, origin, false)).toBe("/offline");
    expect(hardNavigationTarget({ ...base, href: "https://app.example/cert/x?a=1#b" }, origin, false)).toBe("/cert/x?a=1#b");
  });
  it("lässt online alles normal laufen", () => {
    expect(hardNavigationTarget(base, origin, true)).toBeNull();
  });
  it("lässt fremde Links, neue Tabs, Downloads und Sondertasten in Ruhe", () => {
    expect(hardNavigationTarget({ ...base, href: "https://fremd.example/" }, origin, false)).toBeNull();
    expect(hardNavigationTarget({ ...base, target: "_blank" }, origin, false)).toBeNull();
    expect(hardNavigationTarget({ ...base, download: true }, origin, false)).toBeNull();
    expect(hardNavigationTarget({ ...base, modified: true }, origin, false)).toBeNull();
    expect(hardNavigationTarget({ ...base, button: 1 }, origin, false)).toBeNull();
    expect(hardNavigationTarget({ ...base, defaultPrevented: true }, origin, false)).toBeNull();
  });
});
