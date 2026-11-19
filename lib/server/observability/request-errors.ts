/**
 * Serverfehler sichtbar machen (R5, Review vom 19.11.2026). `onRequestError` in instrumentation.ts meldet jeden Fehler, den
 * Next.js beim Rendern, in Route-Handlern, Server-Aktionen oder im Proxy auffängt. Er landet als eine JSON-Zeile im Log
 * (`docker compose logs app | grep request_error`) und wird gezählt; `/api/monitor` gibt die Zahl an scripts/monitor.sh weiter.
 *
 * Nicht gezählt: Fehler, die eine Route selbst abfängt und als 500 beantwortet. Die Zählung liegt im Speicher des Prozesses
 * und beginnt nach einem Neustart bei null.
 */

export interface RequestErrorEntry {
  at: number;
  method: string;
  /** Pfad ohne Query (die kann Einmal-Tokens enthalten). */
  path: string;
  routePath: string | null;
  routeType: string | null;
  digest: string | null;
  message: string;
}

const MAX_ENTRIES = 500;
// Über globalThis: instrumentation.ts und die Route /api/monitor können in getrennten Bundles mit eigenen Modulinstanzen laufen.
const KEY = Symbol.for("learning.requestErrors");
type Store = { entries: RequestErrorEntry[] };
function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  return (g[KEY] ??= { entries: [] });
}

export function stripQuery(path: string): string {
  const index = path.search(/[?#]/);
  return index === -1 ? path : path.slice(0, index);
}

interface RequestInfo {
  path: string;
  method: string;
}
interface ContextInfo {
  routePath?: string;
  routeType?: string;
}

/** Hält einen Fehler fest und schreibt ihn als eine JSON-Zeile ins Log. Wirft nie. */
export function recordRequestError(error: unknown, request: RequestInfo, context: ContextInfo | undefined, now = Date.now()): RequestErrorEntry {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : null;
  const entry: RequestErrorEntry = {
    at: now,
    method: request.method,
    path: stripQuery(request.path),
    routePath: context?.routePath ?? null,
    routeType: context?.routeType ?? null,
    digest,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
  };
  const entries = store().entries;
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  try {
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_error",
        time: new Date(now).toISOString(),
        ...entry,
        at: undefined,
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined,
      }),
    );
  } catch {
    // Loggen darf nie selbst einen Fehler auslösen.
  }
  return entry;
}

/** Fehler der letzten `windowMs` Millisekunden, neueste zuerst. */
export function recentRequestErrors(windowMs: number, now = Date.now()): RequestErrorEntry[] {
  return store()
    .entries.filter((entry) => entry.at > now - windowMs)
    .reverse();
}

/** Nur für Tests. */
export function resetRequestErrorsForTests(): void {
  store().entries.length = 0;
}
