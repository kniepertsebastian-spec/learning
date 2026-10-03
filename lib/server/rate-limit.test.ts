import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp, resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit and blocks the next one", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", 3, 60_000, now)).toEqual({ ok: true });
    }
    expect(checkRateLimit("k", 3, 60_000, now)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("starts a fresh window once the old one has expired", () => {
    const now = 1_000_000;
    checkRateLimit("k", 1, 60_000, now);
    expect(checkRateLimit("k", 1, 60_000, now + 30_000).ok).toBe(false);
    expect(checkRateLimit("k", 1, 60_000, now + 60_000)).toEqual({ ok: true });
  });

  it("counts keys independently", () => {
    const now = 1_000_000;
    checkRateLimit("a", 1, 60_000, now);
    expect(checkRateLimit("b", 1, 60_000, now)).toEqual({ ok: true });
  });
});

describe("getClientIp", () => {
  it("prefers Cloudflare's connecting IP", () => {
    const headers = new Headers({
      "cf-connecting-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2, 3.3.3.3",
    });
    expect(getClientIp(headers)).toBe("1.1.1.1");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
  });

  it("returns 'unknown' without proxy headers", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
