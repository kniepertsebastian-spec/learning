import { describe, expect, it } from "vitest";
import { formatAge, oldestAgeMs, unsyncedWarning, UNSYNCED_WARNING_AFTER_MS } from "./unsynced";

const now = new Date("2026-10-24T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const base = { count: 3, standalone: false, iosSafari: true, now };

describe("unsyncedWarning", () => {
  it("warnt auf iOS ohne Installation ab 24 Stunden", () => {
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: ago(UNSYNCED_WARNING_AFTER_MS) })).toMatchObject({ count: 3 });
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: ago(UNSYNCED_WARNING_AFTER_MS - 60_000) })).toBeNull();
  });
  it("warnt nicht bei installierter App, anderen Browsern oder ohne Ergebnisse", () => {
    const old = ago(3 * 86_400_000);
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: old, standalone: true })).toBeNull();
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: old, iosSafari: false })).toBeNull();
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: old, count: 0 })).toBeNull();
    expect(unsyncedWarning({ ...base, oldestUnsyncedAt: null })).toBeNull();
  });
});

describe("Alter", () => {
  it("rechnet das Alter und begrenzt es nach unten", () => {
    expect(oldestAgeMs(ago(5000), now)).toBe(5000);
    expect(oldestAgeMs(new Date(now.getTime() + 5000).toISOString(), now)).toBe(0);
    expect(oldestAgeMs("kein Datum", now)).toBeNull();
  });
  it("formatiert in ganzen Einheiten", () => {
    expect(formatAge(3 * 86_400_000 + 5, "de")).toBe("vor 3 Tagen");
    expect(formatAge(86_400_000, "de")).toBe("vor 1 Tag");
    expect(formatAge(5 * 3_600_000, "en")).toBe("5 hours ago");
    expect(formatAge(60_000, "de")).toBe("gerade eben");
  });
});
