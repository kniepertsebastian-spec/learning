import { assertPublicHttpUrl } from "./ssrf-guard";

export class UrlFetchError extends Error {}

export interface FetchedUrlContent {
  buffer: Buffer;
  contentType: string;
}

/**
 * Gemeinsam genutzt von der R1.1-URL-Quellenregistrierung
 * (lib/server/admin/sources.ts) und dem Blueprint-Preflight
 * (lib/server/course-generation/sources.ts::fetchSource()) - ein Admin gibt
 * eine URL an, der Server ruft sie ab. `redirect: "manual"` statt
 * automatisch zu folgen: ein Redirect-Ziel würde sonst den SSRF-Schutz
 * umgehen (Check läuft nur gegen die ursprünglich angegebene URL). Wer auf
 * eine Weiterleitung trifft, bekommt eine klare Fehlermeldung und kann die
 * Ziel-URL direkt angeben.
 */
export async function fetchUrlSafely(
  url: string,
  opts: { timeoutMs: number; maxBytes: number },
): Promise<FetchedUrlContent> {
  await assertPublicHttpUrl(url);

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      response = await fetch(url, { signal: controller.signal, redirect: "manual" });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    throw new UrlFetchError(`Quelle "${url}" nicht erreichbar: ${(error as Error).message}`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new UrlFetchError(
      `Quelle "${url}" antwortet mit einer Weiterleitung (Status ${response.status}) - bitte die Ziel-URL direkt angeben.`,
    );
  }
  if (!response.ok) {
    throw new UrlFetchError(`Quelle "${url}" antwortete mit Status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > opts.maxBytes) {
    throw new UrlFetchError(`Quelle "${url}" ist größer als ${opts.maxBytes / (1024 * 1024)} MB.`);
  }
  if (buffer.byteLength === 0) {
    throw new UrlFetchError(`Quelle "${url}" lieferte keinen Inhalt.`);
  }

  return { buffer, contentType };
}
