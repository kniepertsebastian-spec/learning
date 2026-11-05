import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { assertPublicHttpUrl, createGuardedLookup, UnsafeUrlError, type ResolveFn } from "./ssrf-guard";

/** Der Abruf einer Adresse schlug fehl (nicht erreichbar, Zeitüberschreitung, Abbruch). */
export class UrlFetchError extends Error {}
/** Die Antwort ist größer als erlaubt. Der Abruf wird abgebrochen, sobald die Grenze überschritten ist. */
export class ResponseTooLargeError extends UrlFetchError {}

const USER_AGENT = "Knowvia-SourceFetcher/1.0";
/** Gesamtdauer eines Abrufs als Vielfaches der Zeitgrenze, die für Verbindungsaufbau und jede Pause zwischen Daten gilt. */
const OVERALL_DEADLINE_FACTOR = 4;

export interface GuardedRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Zeitgrenze für Verbindungsaufbau und jede Pause zwischen zwei Datenpaketen. */
  timeoutMs: number;
  /** Größte angenommene Antwort in Byte (nach dem Entpacken). */
  maxBytes: number;
}

export interface GuardedRequestDeps {
  /** DNS-Auflösung; nur für Tests austauschbar. */
  resolve?: ResolveFn;
  /**
   * Ohne Adressprüfung abrufen. Nur für ein Ziel, das ausdrücklich im eigenen Netz liegen darf (SSO_ALLOW_PRIVATE_IDP)
   * und für Tests gegen einen lokalen Server; nie für eine von Nutzern eingegebene Adresse.
   */
  allowPrivateNetwork?: boolean;
}

export interface GuardedResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Leer bei einer Weiterleitung (3xx): ihr Inhalt wird nicht gelesen. */
  body: Buffer;
}

function decoderFor(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch (encoding) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/**
 * HTTP(S)-Abruf einer Adresse, die ein Nutzer angeben kann (Quellenimport, SSO-Anbieter).
 * - Die Adressprüfung läuft beim Verbindungsaufbau (createGuardedLookup), nicht nur vorab: kein DNS-Rebinding.
 * - Weiterleitungen werden nicht verfolgt; ein Ziel nach der Weiterleitung wäre sonst ungeprüft.
 * - Die Antwort wird gestreamt und bei Überschreiten von maxBytes abgebrochen, statt erst komplett im Speicher zu landen
 *   (gilt auch nach dem Entpacken, das schützt vor Zip-Bomben).
 * - Zeitgrenze für Verbindung und Pausen, dazu eine Obergrenze für die Gesamtdauer (langsame Quellen, die Byte für Byte schicken).
 */
export async function guardedRequest(url: string, options: GuardedRequestOptions, deps: GuardedRequestDeps = {}): Promise<GuardedResponse> {
  if (!deps.allowPrivateNetwork) await assertPublicHttpUrl(url, deps.resolve);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError(`"${url}" ist keine gültige URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(`Nur http(s)-URLs sind erlaubt, nicht "${parsed.protocol}".`);
  }
  const transport = parsed.protocol === "https:" ? https : http;

  return new Promise<GuardedResponse>((resolvePromise, reject) => {
    let settled = false;
    // `deadline` wird erst unten angelegt, `finish` läuft aber immer später (asynchron), dann gibt es es schon.
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      settle();
    };
    const fail = (error: unknown) =>
      finish(() => reject(error instanceof UnsafeUrlError || error instanceof UrlFetchError ? error : new UrlFetchError(error instanceof Error ? error.message : String(error))));

    const request = transport.request(
      parsed,
      {
        method: options.method ?? "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "*/*",
          ...options.headers,
          ...(options.body !== undefined ? { "content-length": String(Buffer.byteLength(options.body)) } : {}),
        },
        lookup: deps.allowPrivateNetwork ? undefined : createGuardedLookup(deps.resolve),
        timeout: options.timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          finish(() => resolvePromise({ status, headers: response.headers, body: Buffer.alloc(0) }));
          return;
        }

        const encoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
        const decoder = encoding && encoding !== "identity" ? decoderFor(encoding) : null;
        if (encoding && encoding !== "identity" && !decoder) {
          response.destroy();
          fail(new UrlFetchError(`Nicht unterstützte Kodierung der Antwort ("${encoding}").`));
          return;
        }
        // Die angegebene Länge ist die der gepackten Antwort; nur ohne Kodierung sagt sie schon etwas über die Größe.
        const declared = Number(response.headers["content-length"]);
        if (!decoder && Number.isFinite(declared) && declared > options.maxBytes) {
          response.destroy();
          fail(new ResponseTooLargeError(`Antwort größer als ${options.maxBytes} Byte.`));
          return;
        }

        const stream: Readable = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            response.destroy();
            stream.destroy();
            fail(new ResponseTooLargeError(`Antwort größer als ${options.maxBytes} Byte.`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => finish(() => resolvePromise({ status, headers: response.headers, body: Buffer.concat(chunks) })));
        stream.on("error", fail);
        response.on("error", fail);
        response.on("close", () => {
          if (!response.complete) fail(new UrlFetchError("Die Verbindung wurde vorzeitig beendet."));
        });
      },
    );
    const deadline = setTimeout(
      () => request.destroy(new UrlFetchError(`Zeitüberschreitung nach ${(options.timeoutMs * OVERALL_DEADLINE_FACTOR) / 1000} s.`)),
      options.timeoutMs * OVERALL_DEADLINE_FACTOR,
    );
    request.on("timeout", () => request.destroy(new UrlFetchError(`Zeitüberschreitung nach ${options.timeoutMs / 1000} s ohne Antwort.`)));
    request.on("error", fail);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}
