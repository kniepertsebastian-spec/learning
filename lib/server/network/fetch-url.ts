import { guardedRequest, ResponseTooLargeError, UrlFetchError, type GuardedRequestDeps } from "./guarded-request";
import { UnsafeUrlError } from "./ssrf-guard";

export { UrlFetchError };

export interface FetchedUrlContent {
  buffer: Buffer;
  contentType: string;
}

/**
 * Gemeinsam genutzt von der R1.1-URL-Quellenregistrierung
 * (lib/server/admin/sources.ts) und dem Blueprint-Preflight
 * (lib/server/course-generation/sources.ts::fetchSource()) - ein Admin gibt
 * eine URL an, der Server ruft sie ab. Die Prüfung auf interne Ziele, das
 * Nicht-Folgen von Weiterleitungen und die Größen- und Zeitgrenzen stehen in
 * guarded-request.ts. Wer auf eine Weiterleitung trifft, bekommt eine klare
 * Fehlermeldung und kann die Ziel-URL direkt angeben.
 */
export async function fetchUrlSafely(
  url: string,
  opts: { timeoutMs: number; maxBytes: number },
  deps?: GuardedRequestDeps,
): Promise<FetchedUrlContent> {
  let response;
  try {
    response = await guardedRequest(url, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes }, deps);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    if (error instanceof ResponseTooLargeError) {
      throw new UrlFetchError(`Quelle "${url}" ist größer als ${opts.maxBytes / (1024 * 1024)} MB.`);
    }
    throw new UrlFetchError(`Quelle "${url}" nicht erreichbar: ${(error as Error).message}`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new UrlFetchError(
      `Quelle "${url}" antwortet mit einer Weiterleitung (Status ${response.status}) - bitte die Ziel-URL direkt angeben.`,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new UrlFetchError(`Quelle "${url}" antwortete mit Status ${response.status}.`);
  }
  if (response.body.byteLength === 0) {
    throw new UrlFetchError(`Quelle "${url}" lieferte keinen Inhalt.`);
  }

  return { buffer: response.body, contentType: String(response.headers["content-type"] ?? "") };
}
