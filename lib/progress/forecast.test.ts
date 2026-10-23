import { describe, expect, it } from "vitest";
import { examOutlook, progressReview, type SnapshotPoint } from "./forecast";

const p = (day: string, secure: number, total = 12): SnapshotPoint => ({ day, secure, total });
const today = "2026-10-21";

describe("Rückblick mit echten Zahlen", () => {
  it("vergleicht mit dem jüngsten Stand, der mindestens 3 Wochen zurückliegt", () => {
    const r = progressReview([p("2026-09-24", 2), p("2026-09-30", 4), p("2026-10-14", 7), p("2026-10-21", 9)], today);
    expect(r).toMatchObject({ weeks: 3, gain: 5, then: { secure: 4 }, now: { secure: 9, total: 12 } });
  });
  it("ohne ausreichenden Verlauf keine Aussage", () => {
    expect(progressReview([], today)).toBeNull();
    expect(progressReview([p("2026-10-21", 9)], today)).toBeNull();
    expect(progressReview([p("2026-10-10", 5), p("2026-10-21", 9)], today)).toBeNull(); // nur 11 Tage
  });
  it("zu alte Stände zählen nicht (älter als 12 Wochen)", () => {
    expect(progressReview([p("2026-06-01", 1), p("2026-10-21", 9)], today)).toBeNull();
  });
});

describe("Einschätzung zum Prüfungstermin (nur für die Person)", () => {
  const series = [p("2026-09-23", 2), p("2026-10-07", 4), p("2026-10-21", 6)];
  it("knapp, wenn das bisherige Tempo nicht reicht", () => {
    const o = examOutlook(series, today, "2026-11-04");
    expect(o).toMatchObject({ status: "tight", target: 10 });
    expect(o && "perWeek" in o ? o.perWeek : null).toBe(1);
  });
  it("auf Kurs, wenn die Hochrechnung das Ziel erreicht", () => {
    expect(examOutlook(series, today, "2026-12-30")).toMatchObject({ status: "on_track" });
  });
  it("erledigt, wenn das Ziel schon erreicht ist", () => {
    expect(examOutlook([p("2026-10-01", 9), p("2026-10-21", 11)], today, "2026-11-30")).toEqual({ status: "done" });
  });
  it("ohne Termin, vergangenen Termin oder zu kurzen Verlauf keine Einschätzung", () => {
    expect(examOutlook(series, today, null)).toBeNull();
    expect(examOutlook(series, today, "2026-10-01")).toBeNull();
    expect(examOutlook([p("2026-10-18", 5), p("2026-10-21", 6)], today, "2026-11-30")).toBeNull();
    expect(examOutlook([p("2026-10-21", 6)], today, "2026-11-30")).toBeNull();
  });
});
