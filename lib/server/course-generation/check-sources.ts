import { describeFetchError, fetchSource, fitSourceBudget, FULL_CONTEXT_MAX_CHARS, PRIMARY_SOURCE_MAX_CHARS, primarySourceIndex, type FetchedSource } from "./sources";

/**
 * Ergebnis je Quelle. `unchecked`: in der Zeit nicht fertig geprüft; der Preflight des Auftrags prüft sie ohnehin noch einmal.
 * Bei geprüften Quellen (Quellen-Roadmap AP-3.3): `chars` = gelesener Text, `keptChars` = was davon an die KI geht,
 * `willTruncate` = die Quelle wird gekürzt, `primary` = sie ist der Prüfungsleitfaden (markiert oder erkannt).
 */
export type SourceCheck =
  | { url: string; ok: true; unchecked?: boolean; chars?: number; keptChars?: number; willTruncate?: boolean; primary?: boolean }
  | { url: string; ok: false; error: string };

/** Auslastung des Quellenpakets gegen das Gesamtbudget (FULL_CONTEXT_MAX_CHARS, Cache-Grenze). */
export interface SourceBudgetSummary {
  /** Zeichen aller geprüften Quellen nach dem Kürzen. */
  totalChars: number;
  budgetChars: number;
  /** Adresse des Prüfungsleitfadens unter den geprüften Quellen, sonst null. */
  primaryUrl: string | null;
  /** Wie viele Quellen nicht rechtzeitig geprüft wurden: die Summe ist dann unvollständig. */
  unchecked: number;
}

export interface SourceCheckReport {
  results: SourceCheck[];
  budget: SourceBudgetSummary;
}

const CONCURRENCY = 6;
/**
 * Höchstdauer der ganzen Prüfung. Vor der App liegt ein Cloudflare-Tunnel, der eine Anfrage nach 100 Sekunden mit einer
 * HTML-Fehlerseite (524) beantwortet; mit 30 Quellen (große PDFs, je bis 30 s Abruf) dauerte die Prüfung länger. Was bis
 * zur Frist nicht fertig ist, gilt als „nicht geprüft“ und wird nicht als Fehler gemeldet.
 */
export const CHECK_DEADLINE_MS = 60_000;

const sizeOf = (source: FetchedSource | undefined) => (source?.excerpts ?? []).reduce((n, e) => n + e.text.length, 0);

/**
 * Prüft vor dem Start, ob sich jede Quelle abrufen lässt und genug Text enthält (derselbe Abruf wie im Preflight des Auftrags),
 * und rechnet aus, wie viel davon ins Budget passt (dieselbe Verteilung wie im Auftrag, fitSourceBudget). Liefert je Adresse
 * nur Status und Zahlen, nie den Inhalt. Die Reihenfolge der Eingabe bleibt erhalten. `markedUrl`: die als Blueprint markierte Quelle.
 */
export async function checkSources(
  urls: string[],
  fetchOne: typeof fetchSource = fetchSource,
  deadlineMs = CHECK_DEADLINE_MS,
  markedUrl?: string | null,
): Promise<SourceCheckReport> {
  const fetched: (FetchedSource | undefined)[] = new Array(urls.length);
  const failed: (string | undefined)[] = new Array(urls.length);
  let next = 0;
  let expired = false;
  async function worker() {
    while (!expired && next < urls.length) {
      const index = next++;
      try {
        // Voll lesen (bis zur Grenze des Leitfadens): erst danach steht fest, welche Quelle der Leitfaden ist und was gekürzt wird.
        fetched[index] = await fetchOne(`check-${index + 1}`, urls[index], PRIMARY_SOURCE_MAX_CHARS);
      } catch (error) {
        failed[index] = describeFetchError(error);
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

  // Momentaufnahme: ein Abruf, der nach der Frist noch fertig wird, ändert das Ergebnis nicht mehr.
  const done = urls.map((url, i) => ({ url, i, source: fetched[i], error: failed[i] })).filter((d) => d.source !== undefined);
  const primaryAmongDone = primarySourceIndex(done.map((d) => ({ url: d.url, excerpts: d.source!.excerpts ?? [] })), markedUrl);
  const plan = fitSourceBudget(done.map((d) => sizeOf(d.source)), primaryAmongDone);
  const byIndex = new Map(done.map((d, k) => [d.i, { chars: sizeOf(d.source), limit: plan.limits[k], primary: k === primaryAmongDone, truncated: d.source!.truncated === true }]));

  const results: SourceCheck[] = urls.map((url, i) => {
    if (failed[i] !== undefined) return { url, ok: false, error: failed[i]! };
    const info = byIndex.get(i);
    if (!info) return { url, ok: true, unchecked: true };
    const keptChars = Math.min(info.chars, info.limit);
    return { url, ok: true, chars: info.chars, keptChars, willTruncate: info.truncated || info.chars > info.limit, ...(info.primary ? { primary: true } : {}) };
  });
  return {
    results,
    budget: {
      totalChars: plan.totalChars,
      budgetChars: FULL_CONTEXT_MAX_CHARS,
      primaryUrl: primaryAmongDone >= 0 ? done[primaryAmongDone].url : null,
      unchecked: results.filter((r) => r.ok && r.unchecked).length,
    },
  };
}
