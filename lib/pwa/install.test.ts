import { describe, expect, it } from "vitest";
import { INSTALL_PAUSE_DAYS, installOffer, isIosSafari } from "./install";

const now = new Date("2026-10-23T12:00:00Z");
const base = { standalone: false, installedAt: null, dismissedAt: null, now, canPrompt: false, iosSafari: false };
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC_SAFARI = IPAD_SAFARI;

describe("isIosSafari", () => {
  it("erkennt Safari auf iPhone und iPadOS, nicht andere Browser oder den Mac", () => {
    expect(isIosSafari(IPHONE_SAFARI, "iPhone", 5)).toBe(true);
    expect(isIosSafari(IPAD_SAFARI, "MacIntel", 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, "iPhone", 5)).toBe(false);
    expect(isIosSafari(MAC_SAFARI, "MacIntel", 0)).toBe(false);
  });
});

describe("installOffer", () => {
  it("bietet den eigenen Button an, wenn der Browser die Installation meldet", () => {
    expect(installOffer({ ...base, canPrompt: true })).toBe("native");
  });
  it("zeigt auf iOS in Safari die Anleitung", () => {
    expect(installOffer({ ...base, iosSafari: true })).toBe("ios");
  });
  it("zeigt nichts, wenn die App schon läuft oder installiert ist", () => {
    expect(installOffer({ ...base, canPrompt: true, standalone: true })).toBeNull();
    expect(installOffer({ ...base, canPrompt: true, installedAt: "2026-10-01T00:00:00Z" })).toBeNull();
  });
  it("pausiert nach „Nicht jetzt“ genau 30 Tage", () => {
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    expect(installOffer({ ...base, canPrompt: true, dismissedAt: at(INSTALL_PAUSE_DAYS - 1) })).toBeNull();
    expect(installOffer({ ...base, canPrompt: true, dismissedAt: at(INSTALL_PAUSE_DAYS + 1) })).toBe("native");
  });
  it("zeigt sonst nichts (Browser ohne Installation)", () => {
    expect(installOffer(base)).toBeNull();
  });
});
