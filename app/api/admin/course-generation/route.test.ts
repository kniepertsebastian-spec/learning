import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth-guards", () => ({ requireAdminApi: guard }));
vi.mock("@/lib/server/admin/rate-limit", () => ({ checkCourseGenerationRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/server/course-generation/job-service", () => ({ createCourseGenerationJob: vi.fn(async () => ({ id: "j1" })), listCourseGenerationJobs: vi.fn(), DuplicateCourseGenerationJobError: class extends Error {}, isTerminalCourseGenerationStatus: () => false, lastActivityByJob: vi.fn(async () => new Map()), STALE_AFTER_MS: 900_000 }));
vi.mock("@/lib/server/course-generation/runner", () => ({ startCourseGenerationJob: vi.fn(), isCourseGenerationJobActive: () => false, recoverStaleCourseGenerationJobsNow: vi.fn(async () => undefined) }));

import { POST } from "./route";

const body = (over: Record<string, unknown>) =>
  new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseTitle: "T", courseDescription: "D", language: "de", provider: "AWS", sourceUrls: ["https://a.example/x"], ...over }) });

describe("Kursgenerierung: Eingabeprüfung", () => {
  beforeEach(() => guard.mockResolvedValue({ ok: true, user: { id: "u" } }));

  it("nennt bei einer ungültigen Quelle die Zeile", async () => {
    const res = await POST(body({ sourceUrls: ["https://a.example/x", "kein link"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Zeile 2");
  });

  it("erlaubt 30 Quellen, mehr nicht (mit verständlicher Meldung)", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `https://a.example/${i}`);
    const tooMany = await POST(body({ sourceUrls: many(31) }));
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error).toContain("höchstens 30 Quellen");
    expect((await POST(body({ sourceUrls: many(30) }))).status).toBe(202);
  });
});
