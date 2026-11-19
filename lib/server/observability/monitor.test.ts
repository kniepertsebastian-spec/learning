import { afterEach, describe, expect, it, vi } from "vitest";
import { recentRequestErrors, recordRequestError, resetRequestErrorsForTests, stripQuery } from "./request-errors";
import { formatMonitorReport, isMonitorAuthorized } from "./monitor";

describe("Serverfehler zählen (onRequestError)", () => {
  afterEach(() => resetRequestErrorsForTests());

  it("schreibt eine JSON-Zeile ohne Query (Einmal-Tokens) und zählt im Zeitfenster", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 10, 19, 12);
    recordRequestError(Object.assign(new Error("db weg"), { digest: "123" }), { path: "/reset?token=geheim", method: "GET" }, { routePath: "/reset", routeType: "render" }, now - 20 * 60_000);
    recordRequestError(new Error("boom"), { path: "/api/x", method: "POST" }, { routeType: "route" }, now - 60_000);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "error", event: "request_error", path: "/reset", digest: "123", message: "db weg", routeType: "render" });
    expect(JSON.stringify(line)).not.toContain("geheim");
    expect(recentRequestErrors(15 * 60_000, now).map((e) => e.path)).toEqual(["/api/x"]);
    log.mockRestore();
  });

  it("stripQuery", () => {
    expect(stripQuery("/a/b?x=1#y")).toBe("/a/b");
    expect(stripQuery("/a")).toBe("/a");
  });
});

describe("/api/monitor", () => {
  it("nur mit gesetztem, ausreichend langem Token und passendem Header", () => {
    const token = "abcdefghijklmnop1234";
    expect(isMonitorAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(isMonitorAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(isMonitorAuthorized(token, token)).toBe(false);
    expect(isMonitorAuthorized(null, token)).toBe(false);
    expect(isMonitorAuthorized("Bearer ", "")).toBe(false);
    expect(isMonitorAuthorized(undefined as never, undefined)).toBe(false);
    expect(isMonitorAuthorized("Bearer kurz", "kurz")).toBe(false);
  });

  it("Zeilenformat für monitor.sh: Tabs und Zeilenumbrüche in Texten werden ersetzt", () => {
    const text = formatMonitorReport({
      databaseError: null,
      requestErrors: { windowMinutes: 15, count: 1, latest: [{ time: "t", method: "GET", path: "/x", digest: null, message: "a\tb\nc" }] },
      failedJobs: [{ id: "j1", title: "Kurs\tA", status: "failed", errorCode: null, completedAt: null }],
      aiBudget: { limitUsd: 100, spentUsd: 81.5, percent: 82 },
      process: { eventLoopP99Ms: 12, eventLoopMaxMs: 40, rssMb: 300, heapUsedMb: 120, activeCourseJobs: 1 },
    });
    expect(text.split("\n")).toEqual([
      "request_errors\t1\t15",
      "request_error\tt\tGET\t/x\ta b c",
      "failed_job\tj1\tfailed\t-\tKurs A",
      "process\t12\t40\t300\t120\t1",
      "ai_budget\t82\t81.50\t100.00",
      "",
    ]);
  });
});

describe("Prozessmessung (R3)", () => {
  it("liefert plausible Werte und setzt die Event-Loop-Messung zurück", async () => {
    const { readProcessStats } = await import("./process-stats");
    readProcessStats();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const start = Date.now();
    while (Date.now() - start < 150) {
      // Event-Loop absichtlich blockieren
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stats = readProcessStats();
    expect(stats.rssMb).toBeGreaterThan(0);
    expect(stats.eventLoopMaxMs).toBeGreaterThanOrEqual(50);
    expect(stats.activeCourseJobs).toBe(0);
  });
});
