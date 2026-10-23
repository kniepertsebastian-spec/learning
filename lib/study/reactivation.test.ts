import { describe, expect, it } from "vitest";
import { dueStage, isQuietHour } from "./reactivation";

const now = new Date("2026-10-23T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("dueStage", () => {
  it("vor 5 Tagen nichts, ab 5 Tagen genau die erste Stufe", () => {
    expect(dueStage({ lastActivityAt: ago(4.9), now, sentSinceActivity: [] })).toBeNull();
    expect(dueStage({ lastActivityAt: ago(5), now, sentSinceActivity: [] })).toBe("d5");
  });
  it("dieselbe Stufe nie zweimal; dann Ruhe bis zur nächsten", () => {
    expect(dueStage({ lastActivityAt: ago(8), now, sentSinceActivity: ["d5"] })).toBeNull();
    expect(dueStage({ lastActivityAt: ago(12), now, sentSinceActivity: ["d5"] })).toBe("d12");
    expect(dueStage({ lastActivityAt: ago(26), now, sentSinceActivity: ["d5", "d12"] })).toBe("d26");
  });
  it("höchstens drei Mails je Pause, danach Ruhe", () => {
    expect(dueStage({ lastActivityAt: ago(40), now, sentSinceActivity: ["d5", "d12", "d26"] })).toBeNull();
  });
  it("holt keine früheren Stufen nach", () => {
    expect(dueStage({ lastActivityAt: ago(14), now, sentSinceActivity: [] })).toBe("d12");
    expect(dueStage({ lastActivityAt: ago(30), now, sentSinceActivity: [] })).toBe("d26");
  });
  it("nach sehr langer Pause und ohne bisherige Aktivität: nichts", () => {
    expect(dueStage({ lastActivityAt: ago(61), now, sentSinceActivity: [] })).toBeNull();
    expect(dueStage({ lastActivityAt: null, now, sentSinceActivity: [] })).toBeNull();
  });
});

describe("isQuietHour", () => {
  it("achtet auf die Zeitzone der Person", () => {
    expect(isQuietHour(new Date("2026-10-23T12:00:00Z"), "Europe/Berlin")).toBe(false); // 14 Uhr
    expect(isQuietHour(new Date("2026-10-23T03:00:00Z"), "Europe/Berlin")).toBe(true); // 5 Uhr
    expect(isQuietHour(new Date("2026-10-23T19:00:00Z"), "Europe/Berlin")).toBe(true); // 21 Uhr
    expect(isQuietHour(new Date("2026-10-23T19:00:00Z"), "America/New_York")).toBe(false); // 15 Uhr
  });
});
