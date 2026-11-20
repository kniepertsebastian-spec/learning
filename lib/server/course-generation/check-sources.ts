import { describeFetchError, fetchSource } from "./sources";

/** `unchecked`: in der Zeit nicht fertig geprüft; der Preflight des Auftrags prüft sie ohnehin noch einmal. */
export type SourceCheck = { url: string; ok: true; unchecked?: boolean } | { url: string; ok: false; error: string };

const CONCURRENCY = 6;
/**
 * Höchstdauer der ganzen Prüfung. Vor der App liegt ein Cloudflare-Tunnel, der eine Anfrage nach 100 Sekunden mit einer
 * HTML-Fehlerseite (524) beantwortet; mit 30 Quellen (große PDFs, je bis 30 s Abruf) dauerte die Prüfung länger. Was bis
 * zur Frist nicht fertig ist, gilt als „nicht geprüft“ und wird nicht als Fehler gemeldet.
 */
export const CHECK_DEADLINE_MS = 60_000;

/**
 * Prüft vor dem Start, ob sich jede Quelle abrufen lässt und genug Text enthält (derselbe Abruf wie im Preflight des Auftrags).
 * Liefert je Adresse nur ok oder die Fehlermeldung, nie den Inhalt. Die Reihenfolge der Eingabe bleibt erhalten.
 */
export async function checkSources(urls: string[], fetchOne: typeof fetchSource = fetchSource, deadlineMs = CHECK_DEADLINE_MS): Promise<SourceCheck[]> {
  const results: (SourceCheck | undefined)[] = new Array(urls.length);
  let next = 0;
  let expired = false;
  async function worker() {
    while (!expired && next < urls.length) {
      const index = next++;
      const url = urls[index];
      try {
        await fetchOne(`check-${index + 1}`, url);
        results[index] = { url, ok: true };
      } catch (error) {
        results[index] = { url, ok: false, error: describeFetchError(error) };
      }
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, deadlineMs);
  });
  await Promise.race([Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker)), deadline]);
  clearTimeout(timer);
  return urls.map((url, i) => results[i] ?? { url, ok: true, unchecked: true });
}
