import { describe, expect, it } from "vitest";
import { detectEngagementSignals, isPattern, type EngagementFacts, type SessionFact } from "./rules";

const now = new Date("2026-10-23T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const calm: EngagementFacts = { sessions: [], window: [], baseline: [], checkinsSkipped: [], exits: 0 };
const reviews = (n: number, errors: number, ms: number) => Array.from({ length: n }, (_, i) => ({ rating: i < errors ? 1 : 3, responseTimeMs: ms }));
const abandoned = (h: number): SessionFact => ({ status: "abandoned", plannedAt: hoursAgo(h), startedAt: null, completedAt: null });
const kinds = (facts: EngagementFacts) => detectEngagementSignals(facts, now).map((s) => s.kind);

describe("Frühwarnung: Signale", () => {
  it("ruhiger Nutzer: keine Signale", () => {
    expect(kinds(calm)).toEqual([]);
  });

  it("abgebrochene und sehr kurze Sessions zählen erst ab zwei", () => {
    expect(kinds({ ...calm, sessions: [abandoned(30)] })).toEqual([]);
    const short: SessionFact = { status: "completed", plannedAt: hoursAgo(50), startedAt: hoursAgo(50), completedAt: new Date(hoursAgo(50).getTime() + 60_000) };
    expect(kinds({ ...calm, sessions: [abandoned(30), short] })).toEqual(["short_sessions"]);
  });

  it("eine liegengebliebene Session zählt erst nach der Frist als abgebrochen", () => {
    const stale: SessionFact = { status: "planned", plannedAt: hoursAgo(20), startedAt: null, completedAt: null };
    const fresh: SessionFact = { status: "planned", plannedAt: hoursAgo(2), startedAt: null, completedAt: null };
    expect(kinds({ ...calm, sessions: [stale, fresh] })).toEqual([]);
    expect(kinds({ ...calm, sessions: [stale, stale] })).toEqual(["short_sessions"]);
  });

  it("Fehlerquote deutlich über dem persönlichen Durchschnitt", () => {
    expect(kinds({ ...calm, window: reviews(12, 6, 5000), baseline: reviews(60, 6, 5000) })).toEqual(["high_error_rate"]);
    expect(kinds({ ...calm, window: reviews(12, 2, 5000), baseline: reviews(60, 6, 5000) })).toEqual([]);
    expect(kinds({ ...calm, window: reviews(5, 5, 5000), baseline: reviews(60, 6, 5000) })).toEqual([]); // zu wenig Daten
  });

  it("deutlich langsamere Antworten, Ausreißer zählen nicht", () => {
    expect(kinds({ ...calm, window: reviews(12, 0, 9000), baseline: reviews(60, 0, 5000) })).toEqual(["slow_answers"]);
    const withOutlier = [...reviews(11, 0, 5000), { rating: 3, responseTimeMs: 600_000 }];
    expect(kinds({ ...calm, window: withOutlier, baseline: reviews(60, 0, 5000) })).toEqual([]);
  });

  it("plötzlich übersprungene Check-ins, aber kein einzelner", () => {
    const filled = [false, false, false, false, false];
    expect(kinds({ ...calm, checkinsSkipped: [true, ...filled, false, false] })).toEqual([]);
    expect(kinds({ ...calm, checkinsSkipped: [true, true, true, ...filled] })).toEqual(["checkin_skipped"]);
    expect(kinds({ ...calm, checkinsSkipped: [true, true, true, true, true, true, true, true] })).toEqual([]); // war nie regelmäßig
  });

  it("Auslösung nur als Muster aus mindestens zwei verschiedenen Arten", () => {
    const one = detectEngagementSignals({ ...calm, checkinsSkipped: [true, true, true, false, false, false, false, false] }, now);
    expect(isPattern(one)).toBe(false);
    const two = detectEngagementSignals(
      { ...calm, sessions: [abandoned(30), abandoned(40), abandoned(60)], window: reviews(12, 6, 5000), baseline: reviews(60, 6, 5000) },
      now,
    );
    expect(two.map((s) => s.kind)).toEqual(["short_sessions", "high_error_rate"]);
    expect(isPattern(two)).toBe(true);
  });
});
