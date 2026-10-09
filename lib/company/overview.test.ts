import { describe, expect, it } from "vitest";
import { daysSince, overviewTotals } from "./overview";

const now = new Date("2026-10-09T10:00:00Z");
const row = (o: Partial<Parameters<typeof overviewTotals>[0][number]> & { daysAgo?: number }) => ({
  memberEmail: "a@x", learningPath: "P", status: "assigned" as const, overdue: false, assignedAt: new Date(now.getTime() - (o.daysAgo ?? 1) * 86_400_000).toISOString(), ...o,
});

describe("overviewTotals", () => {
  it("zählt aktive, überfällige und die Abschlussquote der letzten 90 Tage", () => {
    const t = overviewTotals([row({ status: "completed" }), row({ learningPath: "Q", overdue: true }), row({ status: "completed", daysAgo: 200 }), row({ status: "in_progress", learningPath: "Q" })], 14, now);
    expect(t).toMatchObject({ members: 14, activePaths: 2, certifications: 1, overdue: 1, completionRate: 33 });
  });
  it("ohne Zuweisungen keine Quote", () => {
    expect(overviewTotals([], 0, now)).toMatchObject({ members: 0, completionRate: null });
  });
});

describe("daysSince", () => {
  it("volle Tage", () => {
    expect(daysSince("2026-10-06T09:00:00Z", now)).toBe(3);
  });
});
