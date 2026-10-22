import { describe, expect, it } from "vitest";
import { resultPromptDue, snoozeUntil } from "@/lib/exams/result-prompt";

const exam = new Date("2026-10-01T09:00:00Z");
const plan = (over: Partial<Parameters<typeof resultPromptDue>[0]> = {}) => ({ status: "planned" as const, scheduledAt: exam, remindersSent: {}, ...over });

describe("resultPromptDue", () => {
  it("fragt erst 1 Tag nach dem Termin", () => {
    expect(resultPromptDue(plan(), new Date("2026-10-01T20:00:00Z"))).toBe(false);
    expect(resultPromptDue(plan(), new Date("2026-10-02T09:00:00Z"))).toBe(true);
  });
  it("fragt nicht ohne Termin oder bei beantworteten Plänen", () => {
    const later = new Date("2026-10-10T00:00:00Z");
    expect(resultPromptDue(plan({ scheduledAt: null }), later)).toBe(false);
    for (const status of ["passed", "failed", "cancelled"] as const) expect(resultPromptDue(plan({ status }), later)).toBe(false);
  });
  it("fragt nach „noch nicht“ erst nach 7 Tagen wieder", () => {
    const answeredAt = new Date("2026-10-03T10:00:00Z");
    const p = plan({ remindersSent: { result_snooze: snoozeUntil(answeredAt) } });
    expect(resultPromptDue(p, new Date("2026-10-09T10:00:00Z"))).toBe(false);
    expect(resultPromptDue(p, new Date("2026-10-10T10:00:00Z"))).toBe(true);
  });
});
