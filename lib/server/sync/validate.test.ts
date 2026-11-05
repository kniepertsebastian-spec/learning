import { describe, expect, it } from "vitest";
import { MAX_SYNC_EVENTS_PER_REQUEST, splitSyncEvents, syncBodySchema } from "./validate";

const event = (overrides: Record<string, unknown> = {}) => ({
  clientEventId: "e1",
  type: "section_quiz",
  clientCreatedAt: "2026-11-05T08:00:00.000Z",
  payload: { sectionId: "s1", answers: [] },
  ...overrides,
});

describe("syncBodySchema", () => {
  it("needs an events array", () => {
    expect(syncBodySchema.safeParse({ events: [] }).success).toBe(true);
    expect(syncBodySchema.safeParse({}).success).toBe(false);
    expect(syncBodySchema.safeParse({ events: "x" }).success).toBe(false);
    expect(syncBodySchema.safeParse(null).success).toBe(false);
  });
});

describe("splitSyncEvents", () => {
  it("passes well-formed events through", () => {
    const { valid, rejected, deferred } = splitSyncEvents([event(), event({ clientEventId: "e2", type: "study_session" })]);
    expect(valid.map((e) => e.clientEventId)).toEqual(["e1", "e2"]);
    expect(rejected).toEqual([]);
    expect(deferred).toBe(0);
  });

  it("rejects an invalid date for that event only, so the rest of the batch still goes through", () => {
    const { valid, rejected } = splitSyncEvents([event({ clientEventId: "bad", clientCreatedAt: "gestern" }), event({ clientEventId: "good" })]);
    expect(valid.map((e) => e.clientEventId)).toEqual(["good"]);
    expect(rejected).toEqual([{ clientEventId: "bad", status: "error", error: "Ungültiges Ereignis.", terminal: true }]);
  });

  it("rejects an unknown type and a missing id", () => {
    const { valid, rejected } = splitSyncEvents([event({ type: "drop_table" }), event({ clientEventId: undefined }), null, "x", 5]);
    expect(valid).toEqual([]);
    // Only the one with a readable id gets an answer the client can match.
    expect(rejected.map((r) => r.clientEventId)).toEqual(["e1"]);
  });

  it("limits the length of the id", () => {
    const { valid } = splitSyncEvents([event({ clientEventId: "x".repeat(101) })]);
    expect(valid).toEqual([]);
  });

  it("keeps only the first of two events with the same id", () => {
    const { valid } = splitSyncEvents([event({ payload: { n: 1 } }), event({ payload: { n: 2 } })]);
    expect(valid).toHaveLength(1);
    expect(valid[0].payload).toEqual({ n: 1 });
  });

  it("leaves events above the limit unanswered so the client sends them next time", () => {
    const many = Array.from({ length: MAX_SYNC_EVENTS_PER_REQUEST + 25 }, (_, i) => event({ clientEventId: `e${i}` }));
    const { valid, deferred } = splitSyncEvents(many);
    expect(valid).toHaveLength(MAX_SYNC_EVENTS_PER_REQUEST);
    expect(deferred).toBe(25);
  });
});
