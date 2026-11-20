import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

let seq = 0;
let ip = "";
beforeEach(() => {
  seq += 1;
  ip = `10.0.0.${seq}`;
});
afterEach(() => vi.restoreAllMocks());

const valid = { boundary: "route", message: "Loading chunk 3 failed.", path: "/learn?x=1", chunkError: true, reloading: true };
function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("http://x/api/client-errors", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", "x-real-ip": ip, ...headers } }));
}

describe("POST /api/client-errors", () => {
  it("loggt eine gültige Meldung bereinigt und antwortet 204", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(valid, { "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(204);
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "client_error", path: "/learn", boundary: "route" });
  });

  it("lehnt fremde Ursprünge ab", async () => {
    expect((await post(valid, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("lehnt ungültige und zu große Meldungen ab", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("kein json")).status).toBe(400);
    expect((await post({ ...valid, boundary: "x" })).status).toBe(400);
    expect((await post({ ...valid, message: "x".repeat(9000) })).status).toBe(413);
  });

  it("begrenzt die Meldungen je IP", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 20; i += 1) expect((await post(valid)).status).toBe(204);
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
