import { describe, expect, it } from "vitest";
import { isPackageLocked } from "./package-expiry";

const now = new Date("2026-10-24T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const ahead = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

describe("isPackageLocked", () => {
  it("ist ohne Einstellung nie gesperrt (Standard aus)", () => {
    expect(isPackageLocked({ downloadedAt: ago(400) }, now)).toBe(false);
    expect(isPackageLocked({ offlineMaxAgeDays: null, downloadedAt: ago(400) }, now)).toBe(false);
  });
  it("sperrt nach den eingestellten Tagen ohne Online-Prüfung", () => {
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ago(40), lastVerifiedAt: ago(31) }, now)).toBe(true);
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ago(40), lastVerifiedAt: ago(29) }, now)).toBe(false);
  });
  it("zählt ohne Prüfzeitpunkt ab dem Download", () => {
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ago(31) }, now)).toBe(true);
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ago(5) }, now)).toBe(false);
  });
  it("sperrt bei zurückgestellter Geräteuhr (Clock-Rollback-Schutz)", () => {
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ahead(2) }, now)).toBe(true);
    expect(isPackageLocked({ offlineMaxAgeDays: 30, downloadedAt: ago(5), lastVerifiedAt: ahead(1) }, now)).toBe(true);
  });
});
