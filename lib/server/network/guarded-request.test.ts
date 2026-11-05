import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchUrlSafely } from "./fetch-url";
import { guardedRequest, ResponseTooLargeError, UrlFetchError } from "./guarded-request";
import { UnsafeUrlError } from "./ssrf-guard";

// Ein lokaler Server auf 127.0.0.1 steht für „das interne Ziel“. Die Prüfung muss ihn ablehnen; für die Fälle, in denen
// der Abruf selbst getestet wird (Größe, Weiterleitung, Zeit), ist die Adressprüfung ausdrücklich abgeschaltet.
const LOCAL = { allowPrivateNetwork: true };

let server: http.Server;
let base = "";
let hits = 0;

beforeAll(async () => {
  server = http.createServer((request, response) => {
    hits++;
    const url = new URL(request.url ?? "/", "http://x");
    switch (url.pathname) {
      case "/ok":
        response.writeHead(200, { "content-type": "text/plain" }).end("hello");
        break;
      case "/echo":
        {
          const chunks: Buffer[] = [];
          request.on("data", (c) => chunks.push(c));
          request.on("end", () => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString(), ua: request.headers["user-agent"], auth: request.headers.authorization })));
        }
        break;
      case "/redirect":
        response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        break;
      case "/missing":
        response.writeHead(404).end("nope");
        break;
      case "/empty":
        response.writeHead(200).end();
        break;
      case "/big-declared":
        response.writeHead(200, { "content-length": String(10_000) }).end("x".repeat(10_000));
        break;
      case "/big-streamed":
        response.writeHead(200, { "transfer-encoding": "chunked" });
        for (let i = 0; i < 20; i++) response.write("y".repeat(1000));
        response.end();
        break;
      case "/gzip":
        response.writeHead(200, { "content-encoding": "gzip", "content-type": "text/plain" }).end(zlib.gzipSync("zipped text"));
        break;
      case "/zip-bomb":
        response.writeHead(200, { "content-encoding": "gzip" }).end(zlib.gzipSync(Buffer.alloc(5_000_000, 0)));
        break;
      case "/weird-encoding":
        response.writeHead(200, { "content-encoding": "compress" }).end("data");
        break;
      case "/hang":
        // antwortet nie
        break;
      case "/drip":
        response.writeHead(200);
        // sendet endlos kleine Pakete: die Pausen-Zeitgrenze greift nie, die Gesamtdauer schon
        {
          const timer = setInterval(() => response.write("z"), 20);
          response.on("close", () => clearInterval(timer));
        }
        break;
      default:
        response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const opts = { timeoutMs: 300, maxBytes: 4096 };

describe("the address check", () => {
  it("refuses an internal target and never connects", async () => {
    hits = 0;
    await expect(guardedRequest(`${base}/ok`, opts)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(fetchUrlSafely(`${base}/ok`, opts)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toBe(0);
  });

  it("catches DNS rebinding: the name looks public for the pre-check but resolves to the internal server when connecting", async () => {
    hits = 0;
    let calls = 0;
    const port = new URL(base).port;
    const resolve = async () => (++calls === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    await expect(guardedRequest(`http://rebind.test:${port}/ok`, opts, { resolve })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(calls).toBe(2); // Vorprüfung und Verbindungsaufbau fragen je einmal
    expect(hits).toBe(0);
  });

  it("connects to a public name only through the checked address", async () => {
    hits = 0;
    const port = new URL(base).port;
    // Beide Fragen liefern „öffentlich“; die Verbindung geht an diese Adresse, die hier niemand beantwortet.
    const resolve = async () => [{ address: "192.0.2.1", family: 4 }]; // TEST-NET-1: gesperrt
    await expect(guardedRequest(`http://public.test:${port}/ok`, opts, { resolve })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toBe(0);
  });
});

describe("the request itself", () => {
  it("returns status, headers and body", async () => {
    const response = await guardedRequest(`${base}/ok`, opts, LOCAL);
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe("hello");
    expect(response.headers["content-type"]).toBe("text/plain");
  });

  it("sends method, headers and body", async () => {
    const response = await guardedRequest(`${base}/echo`, { ...opts, method: "POST", headers: { authorization: "Bearer t" }, body: "a=1&b=ä" }, LOCAL);
    expect(JSON.parse(response.body.toString())).toEqual({ method: "POST", body: "a=1&b=ä", ua: "Knowvia-SourceFetcher/1.0", auth: "Bearer t" });
  });

  it("does not follow a redirect", async () => {
    hits = 0;
    const response = await guardedRequest(`${base}/redirect`, opts, LOCAL);
    expect(response.status).toBe(302);
    expect(response.body.byteLength).toBe(0);
    expect(hits).toBe(1); // nur die erste Adresse, nicht das Ziel der Weiterleitung
  });

  it("decompresses gzip", async () => {
    expect((await guardedRequest(`${base}/gzip`, opts, LOCAL)).body.toString()).toBe("zipped text");
  });

  it("rejects an encoding it does not know", async () => {
    await expect(guardedRequest(`${base}/weird-encoding`, opts, LOCAL)).rejects.toBeInstanceOf(UrlFetchError);
  });
});

describe("limits", () => {
  it("rejects a declared length over the limit before reading", async () => {
    await expect(guardedRequest(`${base}/big-declared`, opts, LOCAL)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("aborts a streamed body as soon as it passes the limit", async () => {
    await expect(guardedRequest(`${base}/big-streamed`, opts, LOCAL)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("limits the size after decompression (zip bomb)", async () => {
    await expect(guardedRequest(`${base}/zip-bomb`, { ...opts, maxBytes: 100_000 }, LOCAL)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("times out when the server never answers", async () => {
    await expect(guardedRequest(`${base}/hang`, { timeoutMs: 150, maxBytes: 4096 }, LOCAL)).rejects.toBeInstanceOf(UrlFetchError);
  });

  it("ends a source that keeps dripping data within the overall deadline", async () => {
    const started = Date.now();
    await expect(guardedRequest(`${base}/drip`, { timeoutMs: 100, maxBytes: 1_000_000 }, LOCAL)).rejects.toBeInstanceOf(UrlFetchError);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("fetchUrlSafely", () => {
  it("returns buffer and content type", async () => {
    expect(await fetchUrlSafely(`${base}/ok`, opts, LOCAL)).toEqual({ buffer: Buffer.from("hello"), contentType: "text/plain" });
  });

  it("explains a redirect, a bad status and an empty body", async () => {
    await expect(fetchUrlSafely(`${base}/redirect`, opts, LOCAL)).rejects.toThrow(/Weiterleitung \(Status 302\)/);
    await expect(fetchUrlSafely(`${base}/missing`, opts, LOCAL)).rejects.toThrow(/Status 404/);
    await expect(fetchUrlSafely(`${base}/empty`, opts, LOCAL)).rejects.toThrow(/keinen Inhalt/);
  });

  it("names the size limit when the source is too big", async () => {
    await expect(fetchUrlSafely(`${base}/big-declared`, { timeoutMs: 300, maxBytes: 100 }, LOCAL)).rejects.toThrow(/ist größer als/);
  });
});
