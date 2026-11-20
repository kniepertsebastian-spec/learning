import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth-guards", () => ({ requireAdminApi: guard }));
vi.mock("@/lib/server/admin/rate-limit", () => ({ checkCourseGenerationRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/server/course-generation/job-service", () => ({ createCourseGenerationJob: vi.fn(async () => ({ id: "j1" })), listCourseGenerationJobs: vi.fn(), DuplicateCourseGenerationJobError: class extends Error {}, isTerminalCourseGenerationStatus: () => false, lastActivityByJob: vi.fn(async () => new Map()), STALE_AFTER_MS: 900_000 }));
const files = vi.hoisted(() => ({ check: vi.fn(async () => [] as { filename: string; message: string }[]), save: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/course-generation/source-files", () => ({ checkSourceFiles: files.check, saveSourceFiles: files.save }));
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

const multipart = (payload: Record<string, unknown>, names: string[]) => {
  const form = new FormData();
  form.append("payload", JSON.stringify({ courseTitle: "T", courseDescription: "D", language: "de", provider: "AWS", ...payload }));
  for (const name of names) form.append("files", new File(["# Leitfaden
" + "x".repeat(300)], name, { type: "text/markdown" }));
  return new Request("http://x", { method: "POST", body: form });
};

describe("Kursgenerierung: Dateien als Quellen", () => {
  beforeEach(() => {
    guard.mockResolvedValue({ ok: true, user: { id: "u" } });
    files.check.mockClear();
    files.save.mockClear();
  });

  it("nimmt Dateien zusammen mit Adressen an und legt sie am Auftrag ab", async () => {
    const res = await POST(multipart({ sourceUrls: ["https://a.example/x"] }, ["leitfaden.md", "notizen.md"]));
    expect(res.status).toBe(202);
    expect(files.save).toHaveBeenCalledWith("j1", expect.arrayContaining([expect.objectContaining({ filename: "leitfaden.md" })]));
  });

  it("erlaubt nur Dateien ohne Adresse", async () => {
    expect((await POST(multipart({}, ["leitfaden.md"]))).status).toBe(202);
  });

  it("ohne Adresse und ohne Datei: verständliche Meldung", async () => {
    const res = await POST(body({ sourceUrls: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("mindestens eine Quelle");
  });

  it("Adressen und Dateien zählen zusammen bis 30", async () => {
    const urls = Array.from({ length: 29 }, (_, i) => `https://a.example/${i}`);
    const res = await POST(multipart({ sourceUrls: urls }, ["a.md", "b.md"]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("höchstens 30 Quellen");
  });

  it("eine unbrauchbare Datei: nichts wird gestartet, die Datei wird genannt", async () => {
    files.check.mockResolvedValueOnce([{ filename: "scan.pdf", message: "Das PDF enthält keinen auswählbaren Text." }]);
    const res = await POST(multipart({}, ["scan.pdf"]));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("scan.pdf");
    expect(files.save).not.toHaveBeenCalled();
  });
});
