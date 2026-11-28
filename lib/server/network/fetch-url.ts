import { guardedRequest, ResponseTooLargeError, UrlFetchError, type GuardedRequestDeps, type GuardedResponse } from "./guarded-request";
import { UnsafeUrlError } from "./ssrf-guard";

export { UrlFetchError };

export interface FetchedUrlContent {
  buffer: Buffer;
  contentType: string;
  /** Adresse nach allen Weiterleitungen (gleich der angefragten, wenn es keine gab). */
  finalUrl: string;
}

/** Höchstzahl verfolgter Weiterleitungen je Abruf (Quellen-Roadmap AP-1.1). */
export const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Header für den Quellenabruf (AP-1.2): Viele Behörden- und Verbandsseiten (oft .php) lehnen `Accept: *\/*` oder fehlende
 * Sprachangaben als Bot ab. Nur hier, nicht in guardedRequest(): der SSO-Abruf (oidc.ts) erwartet JSON.
 */
export const SOURCE_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  accept: "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "accept-language": "de-DE,de;q=0.9,en;q=0.8",
};
/**
 * Zweiter Versuch, wenn eine Firewall den eigenen User-Agent mit 403/406 abweist: ein gewöhnlicher Browser-User-Agent.
 * Es geht um öffentliche Dokumente, die jeder Browser ohne Anmeldung bekommt; der Abruf bleibt einmalig und gedrosselt.
 */
export const BROWSER_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WAF_REJECT_STATUSES = new Set([403, 406]);

/**
 * Gemeinsam genutzt von der R1.1-URL-Quellenregistrierung (lib/server/admin/sources.ts) und dem Preflight der
 * Kurserstellung (lib/server/course-generation/sources.ts::fetchSource()) - ein Admin gibt eine URL an, der Server ruft sie ab.
 *
 * Weiterleitungen (301/302/303/307/308) werden bis MAX_REDIRECTS verfolgt. Jeder Hop ist ein eigener guardedRequest():
 * Adressprüfung vorab und beim Verbindungsaufbau (kein DNS-Rebinding), Größen- und Zeitgrenzen - ein Ziel nach der
 * Weiterleitung ist also genauso geprüft wie die erste Adresse. Schleifen, fehlende Location-Header und zu viele Hops
 * enden mit einer klaren Fehlermeldung.
 */
export async function fetchUrlSafely(
  url: string,
  opts: { timeoutMs: number; maxBytes: number },
  deps?: GuardedRequestDeps,
  /** Nur für Tests austauschbar (z. B. eine Weiterleitung auf ein internes Ziel vortäuschen). */
  request: typeof guardedRequest = guardedRequest,
): Promise<FetchedUrlContent> {
  const seen = new Set<string>([url]);
  let current = url;
  let userAgent: string | undefined;
  let response: GuardedResponse;
  for (let hops = 0; ; ) {
    response = await requestOnce(request, url, current, opts, userAgent, deps);
    if (WAF_REJECT_STATUSES.has(response.status) && userAgent === undefined) {
      userAgent = BROWSER_USER_AGENT;
      continue;
    }
    if (!REDIRECT_STATUSES.has(response.status)) break;
    const location = response.headers.location;
    if (!location) throw new UrlFetchError(`Quelle "${url}" leitet weiter (Status ${response.status}), nennt aber kein Ziel.`);
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw new UrlFetchError(`Quelle "${url}" leitet auf eine ungültige Adresse weiter.`);
    }
    if (seen.has(next)) throw new UrlFetchError(`Quelle "${url}" leitet im Kreis weiter - bitte die Ziel-URL direkt angeben.`);
    if (++hops > MAX_REDIRECTS) {
      throw new UrlFetchError(`Quelle "${url}" leitet mehr als ${MAX_REDIRECTS}-mal weiter - bitte die Ziel-URL direkt angeben.`);
    }
    seen.add(next);
    current = next;
  }

  if (response.status >= 300 && response.status < 400) {
    throw new UrlFetchError(`Quelle "${url}" antwortet mit Status ${response.status} - bitte die Ziel-URL direkt angeben.`);
  }
  if (response.status < 200 || response.status >= 300) {
    const via = current !== url ? ` (nach Weiterleitung auf ${current})` : "";
    throw new UrlFetchError(`Quelle "${url}" antwortete mit Status ${response.status}${via}.`);
  }
  if (response.body.byteLength === 0) {
    throw new UrlFetchError(`Quelle "${url}" lieferte keinen Inhalt.`);
  }

  return { buffer: response.body, contentType: String(response.headers["content-type"] ?? ""), finalUrl: current };
}

async function requestOnce(
  request: typeof guardedRequest,
  original: string,
  target: string,
  opts: { timeoutMs: number; maxBytes: number },
  userAgent: string | undefined,
  deps?: GuardedRequestDeps,
): Promise<GuardedResponse> {
  try {
    const headers = userAgent ? { ...SOURCE_REQUEST_HEADERS, "user-agent": userAgent } : { ...SOURCE_REQUEST_HEADERS };
    return await request(target, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes, headers }, deps);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      if (target === original) throw error;
      throw new UnsafeUrlError(`Quelle "${original}" leitet auf eine nicht erlaubte Adresse weiter: ${error.message}`);
    }
    if (error instanceof ResponseTooLargeError) {
      throw new UrlFetchError(`Quelle "${original}" ist größer als ${opts.maxBytes / (1024 * 1024)} MB.`);
    }
    throw new UrlFetchError(`Quelle "${original}" nicht erreichbar: ${(error as Error).message}`);
  }
}

/** Endet der Pfad der Adresse auf .pdf (Groß-/Kleinschreibung egal, Abfrage und Anker zählen nicht)? */
export function isPdfPath(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().split(/[?#]/)[0].endsWith(".pdf");
  }
}

const PDF_SIGNATURE = Buffer.from("%PDF-");

/**
 * Ist der Abruf eine PDF? Inhaltstyp, Dateiendung (vor oder nach Weiterleitungen) oder die Signatur am Anfang: Downloads
 * hinter .php-Skripten kommen oft als application/octet-stream ohne .pdf in der Adresse.
 */
export function looksLikePdf(content: FetchedUrlContent, requestedUrl: string): boolean {
  return (
    content.contentType.toLowerCase().includes("application/pdf") ||
    isPdfPath(requestedUrl) ||
    isPdfPath(content.finalUrl) ||
    content.buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  );
}
