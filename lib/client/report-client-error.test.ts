import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientErrorReport, reportClientError, resetClientErrorReportsForTests } from "./report-client-error";

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
beforeEach(() => {
  resetClientErrorReportsForTests();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { pathname: "/learn/1" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Client-Fehler melden", () => {
  it("baut die Meldung und erkennt Chunk-Fehler", () => {
    const error = Object.assign(new Error("Loading chunk 9 failed."), { name: "ChunkLoadError", digest: "d1" });
    expect(buildClientErrorReport(error, { boundary: "global", reloading: true }, "/x")).toMatchObject({
      boundary: "global",
      name: "ChunkLoadError",
      message: "Loading chunk 9 failed.",
      digest: "d1",
      path: "/x",
      chunkError: true,
      reloading: true,
    });
    expect(buildClientErrorReport("nur Text", { boundary: "route", reloading: false }, "/x")).toMatchObject({ message: "nur Text", chunkError: false });
  });

  it("sendet mit keepalive, dieselbe Meldung nur einmal und höchstens drei je Seite", () => {
    reportClientError(new Error("a"), { boundary: "route", reloading: false });
    reportClientError(new Error("a"), { boundary: "route", reloading: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/client-errors");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toMatchObject({ path: "/learn/1", message: "a" });
    for (const m of ["b", "c", "d", "e"]) reportClientError(new Error(m), { boundary: "route", reloading: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("wirft nie, auch wenn fetch scheitert", () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(() => reportClientError(new Error("x"), { boundary: "route", reloading: false })).not.toThrow();
  });
});
