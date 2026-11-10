import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readBodyCapped, readFormDataCapped, readJsonCapped } from "./capped-body";

/** Ein Request, dessen Body in Stücken ohne Content-Length ankommt - wie bei einem chunked Upload. */
function chunkedRequest(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/x", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
}

describe("readBodyCapped", () => {
  it("liest einen Body unter der Grenze vollständig", async () => {
    const body = await readBodyCapped(chunkedRequest(["abc", "def"]), 10);
    expect(body.toString()).toBe("abcdef");
  });

  it("bricht ohne Content-Length ab, sobald die Stücke zusammen die Grenze überschreiten", async () => {
    const request = chunkedRequest(["12345", "67890", "x"]);
    expect(request.headers.get("content-length")).toBeNull();
    await expect(readBodyCapped(request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("lehnt eine zu große angegebene Länge ab, ohne den Body zu lesen", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: "x".repeat(50) });
    await expect(readBodyCapped(request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("lässt genau die Grenze noch zu", async () => {
    const body = await readBodyCapped(chunkedRequest(["12345", "67890"]), 10);
    expect(body.byteLength).toBe(10);
  });

  it("liefert für eine Anfrage ohne Body einen leeren Puffer", async () => {
    const body = await readBodyCapped(new Request("http://localhost/x", { method: "POST" }), 10);
    expect(body.byteLength).toBe(0);
  });
});

describe("readJsonCapped", () => {
  it("parst JSON und meldet ungültiges JSON als SyntaxError", async () => {
    await expect(readJsonCapped(chunkedRequest(['{"a":', "1}"]), 100)).resolves.toEqual({ a: 1 });
    await expect(readJsonCapped(chunkedRequest(["{kaputt"]), 100)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("zählt Bytes, nicht Zeichen: Umlaute belegen mehr als ein Byte", async () => {
    await expect(readJsonCapped(chunkedRequest(['"ääää"']), 8)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});

describe("readFormDataCapped", () => {
  it("liest ein Formular innerhalb der Grenze", async () => {
    const form = new FormData();
    form.set("title", "Leitfaden");
    form.set("file", new File(["# Titel"], "a.md", { type: "text/markdown" }));
    // Ein Multipart-Body samt Content-Type (mit boundary) aus einem echten Request nachbauen.
    const source = new Request("http://localhost/x", { method: "POST", body: form });
    const raw = new Uint8Array(await source.arrayBuffer());
    const request = new Request("http://localhost/x", { method: "POST", body: raw, headers: { "content-type": source.headers.get("content-type")! } });

    const parsed = await readFormDataCapped(request, 10_000);
    expect(parsed.get("title")).toBe("Leitfaden");
    expect(await (parsed.get("file") as File).text()).toBe("# Titel");
  });

  it("lehnt ein zu großes Formular ab", async () => {
    const request = chunkedRequest(["x".repeat(30)], { "content-type": "multipart/form-data; boundary=x" });
    await expect(readFormDataCapped(request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
