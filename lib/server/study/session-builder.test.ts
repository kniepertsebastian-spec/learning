import { describe, expect, it } from "vitest";
import {
  COMEBACK_GAP_DAYS,
  computeLessonFallbackCount,
  computeSessionComposition,
  computeStreak,
  estimateSessionMinutes,
  estimateTargetQuestionCount,
  isComebackSession,
  MINUTES_PER_SESSION_QUESTION,
  reallocateTowardFamiliarContent,
} from "./session-builder";

describe("estimateTargetQuestionCount", () => {
  it("uses the goal value directly for a questions-based goal", () => {
    expect(estimateTargetQuestionCount("questions", 20)).toBe(20);
  });

  it("converts a minutes-based goal using the session pacing constant", () => {
    expect(estimateTargetQuestionCount("minutes", 15)).toBe(Math.round(15 / MINUTES_PER_SESSION_QUESTION));
  });

  it("never returns less than 1", () => {
    expect(estimateTargetQuestionCount("minutes", 0)).toBe(1);
    expect(estimateTargetQuestionCount("questions", 0)).toBe(1);
  });
});

describe("estimateSessionMinutes", () => {
  it("scales linearly with question count", () => {
    expect(estimateSessionMinutes(10)).toBe(Math.round(10 * MINUTES_PER_SESSION_QUESTION));
  });

  it("never returns less than 1", () => {
    expect(estimateSessionMinutes(0)).toBe(1);
  });
});

describe("computeSessionComposition", () => {
  it("splits a well-stocked session roughly 60/25/15", () => {
    // Due count exactly matches the regular review share (12) - not a
    // backlog, so no throttling kicks in and the split stays clean.
    const result = computeSessionComposition(20, 12, 100, 100);
    expect(result).toEqual({ review: 12, weak: 5, new: 3 });
    expect(result.review + result.weak + result.new).toBe(20);
  });

  it("caps each category at its available pool and backfills from new content", () => {
    // Only 2 due reviews and 1 weak question available, rest should come from new content.
    const result = computeSessionComposition(20, 2, 1, 100);
    expect(result.review).toBe(2);
    expect(result.weak).toBe(1);
    expect(result.review + result.weak + result.new).toBe(20);
  });

  it("throttles new content when the review backlog exceeds its regular share", () => {
    // 60% of 20 is 12, but 30 reviews are due - new content should drop to 0
    // and review should absorb the reclaimed slots (still capped by target).
    const result = computeSessionComposition(20, 30, 5, 100);
    expect(result.new).toBe(0);
    expect(result.review).toBeGreaterThan(12);
  });

  it("never exceeds the combined available pools", () => {
    const result = computeSessionComposition(20, 3, 2, 1);
    expect(result.review + result.weak + result.new).toBeLessThanOrEqual(3 + 2 + 1);
  });

  it("returns an all-zero composition when every pool is empty", () => {
    expect(computeSessionComposition(20, 0, 0, 0)).toEqual({ review: 0, weak: 0, new: 0 });
  });
});

describe("reallocateTowardFamiliarContent", () => {
  it("moves new-content slots into review first, then spills the rest into weak", () => {
    const result = reallocateTowardFamiliarContent({ review: 5, weak: 3, new: 4 }, 8, 100);
    // Review absorbs 3 (headroom 8-5), the last reclaimed slot spills into weak.
    expect(result).toEqual({ review: 8, weak: 4, new: 0 });
  });

  it("spills remaining reclaimed slots into weak once review is full", () => {
    const result = reallocateTowardFamiliarContent({ review: 5, weak: 3, new: 4 }, 6, 10);
    // Review can only take 1 more (headroom 6-5=1), remaining 3 go to weak.
    expect(result).toEqual({ review: 6, weak: 6, new: 0 });
  });

  it("leaves new content in place when review and weak have no headroom", () => {
    const result = reallocateTowardFamiliarContent({ review: 5, weak: 3, new: 4 }, 5, 3);
    expect(result).toEqual({ review: 5, weak: 3, new: 4 });
  });

  it("never changes the total item count", () => {
    const composition = { review: 5, weak: 3, new: 4 };
    const total = composition.review + composition.weak + composition.new;
    const result = reallocateTowardFamiliarContent(composition, 20, 20);
    expect(result.review + result.weak + result.new).toBe(total);
  });
});

describe("computeLessonFallbackCount", () => {
  it("returns 0 when the question composition already meets the target", () => {
    expect(computeLessonFallbackCount(20, { review: 12, weak: 5, new: 3 })).toBe(0);
  });

  it("returns the shortfall when pools were too small to reach the target", () => {
    expect(computeLessonFallbackCount(20, { review: 2, weak: 1, new: 1 })).toBe(16);
  });
});

describe("computeStreak", () => {
  const TODAY = new Date("2026-01-15T09:00:00Z");

  it("counts a single day studied today as a streak of 1", () => {
    expect(computeStreak([new Date("2026-01-15T20:00:00Z")], TODAY)).toBe(1);
  });

  it("counts consecutive days ending today", () => {
    const dates = [
      new Date("2026-01-15T08:00:00Z"),
      new Date("2026-01-14T08:00:00Z"),
      new Date("2026-01-13T08:00:00Z"),
    ];
    expect(computeStreak(dates, TODAY)).toBe(3);
  });

  it("still counts yesterday's streak if today hasn't been studied yet", () => {
    const dates = [new Date("2026-01-14T08:00:00Z"), new Date("2026-01-13T08:00:00Z")];
    expect(computeStreak(dates, TODAY)).toBe(2);
  });

  it("stops at the first gap", () => {
    const dates = [
      new Date("2026-01-15T08:00:00Z"),
      new Date("2026-01-14T08:00:00Z"),
      // gap on 2026-01-13
      new Date("2026-01-12T08:00:00Z"),
    ];
    expect(computeStreak(dates, TODAY)).toBe(2);
  });

  it("returns 0 when neither today nor yesterday was studied", () => {
    expect(computeStreak([new Date("2026-01-10T08:00:00Z")], TODAY)).toBe(0);
  });

  it("returns 0 for no completed sessions at all", () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it("counts duplicate same-day completions only once", () => {
    const dates = [
      new Date("2026-01-15T08:00:00Z"),
      new Date("2026-01-15T18:00:00Z"),
      new Date("2026-01-14T08:00:00Z"),
    ];
    expect(computeStreak(dates, TODAY)).toBe(2);
  });
});

describe("isComebackSession", () => {
  const NOW = new Date("2026-01-15T09:00:00Z");

  it("is not a comeback when there is no prior activity at all", () => {
    expect(isComebackSession(null, NOW)).toBe(false);
  });

  it("is not a comeback right after the last session", () => {
    expect(isComebackSession(new Date("2026-01-14T09:00:00Z"), NOW)).toBe(false);
  });

  it("is not a comeback just under the gap threshold", () => {
    const justUnder = new Date(NOW.getTime() - (COMEBACK_GAP_DAYS * 24 * 60 * 60 * 1000 - 1));
    expect(isComebackSession(justUnder, NOW)).toBe(false);
  });

  it("is a comeback exactly at the gap threshold", () => {
    const exactly = new Date(NOW.getTime() - COMEBACK_GAP_DAYS * 24 * 60 * 60 * 1000);
    expect(isComebackSession(exactly, NOW)).toBe(true);
  });

  it("is a comeback after a long pause", () => {
    expect(isComebackSession(new Date("2025-12-01T09:00:00Z"), NOW)).toBe(true);
  });
});
