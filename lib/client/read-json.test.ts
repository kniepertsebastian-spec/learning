import { describe, expect, it } from "vitest";
import { isGatewayStatus, NonJsonResponseError, readJsonResponse } from "./read-json";

describe("readJsonResponse", () => {
  it("liest JSON", async () => {
    expect(await readJsonResponse<{ a: number }>(new Response(JSON.stringify({ a: 1 }), { status: 202 }))).toEqual({ a: 1 });
  });

  it("meldet eine HTML-Fehlerseite (z. B. Cloudflare 524) mit Status statt „Unexpected token“", async () => {
    const res = new Response("<!DOCTYPE html><html>A timeout occurred</html>", { status: 524 });
    const error = await readJsonResponse(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NonJsonResponseError);
    expect((error as NonJsonResponseError).status).toBe(524);
    expect(isGatewayStatus(524)).toBe(true);
    expect(isGatewayStatus(400)).toBe(false);
  });
});
