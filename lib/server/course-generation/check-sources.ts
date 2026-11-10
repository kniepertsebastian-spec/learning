import { describeFetchError, fetchSource } from "./sources";

export type SourceCheck = { url: string; ok: true } | { url: string; ok: false; error: string };

const CONCURRENCY = 5;

/**
 * Prüft vor dem Start, ob sich jede Quelle abrufen lässt und genug Text enthält (derselbe Abruf wie im Preflight des Auftrags).
 * Liefert je Adresse nur ok oder die Fehlermeldung, nie den Inhalt. Die Reihenfolge der Eingabe bleibt erhalten.
 */
export async function checkSources(urls: string[], fetchOne: typeof fetchSource = fetchSource): Promise<SourceCheck[]> {
  const results: SourceCheck[] = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
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
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}
