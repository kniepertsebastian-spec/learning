import { describe, expect, it } from "vitest";
import { readJson, UnexpectedResponseError } from "./read-json";

describe("readJson", () => {
  it("liest JSON", async () => {
    const res = new Response(JSON.stringify({ a: 1 }), { headers: { "content-type": "application/json" } });
    await expect(readJson(res)).resolves.toEqual({ a: 1 });
  });

  it("meldet eine HTML-Fehlerseite (Cloudflare 524) verständlich statt mit einem JSON-Parserfehler", async () => {
    const res = new Response("<!DOCTYPE html><html>timeout</html>", { status: 524, headers: { "content-type": "text/html" } });
    const error = (await readJson(res).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(UnexpectedResponseError);
    expect(error.message).toMatch(/Zeitüberschreitung/);
    expect(error.message).not.toMatch(/DOCTYPE|JSON/);
  });

  it("meldet kaputtes JSON mit Status", async () => {
    const res = new Response("{", { status: 500, headers: { "content-type": "application/json" } });
    await expect(readJson(res)).rejects.toThrow(/Status 500/);
  });
});
