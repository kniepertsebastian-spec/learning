import { describe, expect, it } from "vitest";
import { certStatus, csvCell, expiryByMonth, expiryFrom, toCsv } from "./logic";

const now = new Date("2026-10-09T10:00:00Z");

describe("certStatus", () => {
  it("unbegrenzt, gültig, läuft bald ab (≤ 90 Tage), abgelaufen", () => {
    expect(certStatus(null, now)).toBe("valid");
    expect(certStatus(new Date("2027-06-01T00:00:00Z"), now)).toBe("valid");
    expect(certStatus(new Date("2027-01-01T00:00:00Z"), now)).toBe("expiring");
    expect(certStatus(new Date("2026-10-08T00:00:00Z"), now)).toBe("expired");
  });
});

describe("expiryFrom / expiryByMonth", () => {
  it("rechnet Monate auf", () => {
    expect(expiryFrom(new Date("2026-01-15T00:00:00Z"), 36)?.toISOString().slice(0, 10)).toBe("2029-01-15");
    expect(expiryFrom(new Date("2026-01-15T00:00:00Z"), null)).toBeNull();
  });
  it("zählt je Monat, nur Künftiges, drei Monate sind „bald“", () => {
    const out = expiryByMonth([new Date("2026-10-20T00:00:00Z"), new Date("2026-10-01T00:00:00Z"), new Date("2027-01-05T00:00:00Z"), null, new Date("2028-01-01T00:00:00Z")], now);
    expect(out).toHaveLength(12);
    expect(out[0]).toMatchObject({ key: "2026-10", count: 1, soon: true });
    expect(out[3]).toMatchObject({ key: "2027-01", count: 1, soon: false });
    expect(out.reduce((n, m) => n + m.count, 0)).toBe(2);
  });
});

describe("CSV", () => {
  it("escaped Trennzeichen und Anführungszeichen, entschärft Formeln", () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('sag "hi"')).toBe('"sag ""hi"""');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+49")).toBe("'+49");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [["1", "x;y"]])).toBe('a;b\r\n1;"x;y"\r\n');
  });
});

import { certReminderStages } from "./logic";
describe("certReminderStages", () => {
  it("90 und 30 Tage, je einmal, nie nach Ablauf", () => {
    expect(certReminderStages(new Date("2027-01-01T00:00:00Z"), {}, now)).toEqual(["d90"]);
    expect(certReminderStages(new Date("2027-01-01T00:00:00Z"), { d90: "x" }, now)).toEqual([]);
    expect(certReminderStages(new Date("2026-10-30T00:00:00Z"), { d90: "x" }, now)).toEqual(["d30"]);
    expect(certReminderStages(new Date("2026-10-30T00:00:00Z"), { d30: "x" }, now)).toEqual([]);
    expect(certReminderStages(new Date("2027-12-01T00:00:00Z"), {}, now)).toEqual([]);
    expect(certReminderStages(new Date("2026-09-01T00:00:00Z"), {}, now)).toEqual([]);
    expect(certReminderStages(null, {}, now)).toEqual([]);
  });
});
