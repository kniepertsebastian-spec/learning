import { describe, expect, it } from "vitest";
import { computeExamResults } from "@/lib/server/psrp/metrics";

describe("computeExamResults", () => {
  it("anonymisiert und liefert Ergebnis samt Bereitschaft vor der Prüfung", () => {
    const [r] = computeExamResults([{ userId: "user-1", group: "planning", status: "passed", scheduledAt: new Date("2026-10-01"), scoresBeforeExam: [60, 85, 88, 91] }], "salt");
    expect(r.user).not.toContain("user-1");
    expect(r).toMatchObject({ group: "planning", result: "passed", readiness: { lastScore: 91 } });
  });
  it("kommt ohne Simulationen zurecht", () => {
    const [r] = computeExamResults([{ userId: "u", group: null, status: "failed", scheduledAt: new Date(), scoresBeforeExam: [] }], "s");
    expect(r.readiness).toEqual({ reached: 0, ready: false, lastScore: null });
  });
});
