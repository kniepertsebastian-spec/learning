import { isChunkLoadError } from "./chunk-error";

/** Höchstens so viele Meldungen je Seitenaufruf; dieselbe Meldung nur einmal. */
const MAX_REPORTS_PER_PAGE = 3;
const sent = new Set<string>();

export interface ClientErrorContext {
  boundary: "global" | "route";
  /** Die Seite lädt wegen eines Chunk-Fehlers gleich neu. */
  reloading: boolean;
}

/** Baut die Meldung für POST /api/client-errors (lib/server/observability/client-errors.ts). */
export function buildClientErrorReport(error: unknown, context: ClientErrorContext, path: string) {
  const err = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; message?: unknown; stack?: unknown; digest?: unknown };
  const text = (value: unknown, max: number) => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined);
  return {
    boundary: context.boundary,
    name: text(err.name, 200),
    message: text(err.message, 2000) ?? String(error).slice(0, 2000),
    digest: text(err.digest, 100),
    stack: text(err.stack, 3000),
    path: path.slice(0, 500),
    chunkError: isChunkLoadError(error),
    reloading: context.reloading,
  };
}

/**
 * Meldet einen Fehler, den eine Fehlerseite aufgefangen hat, an den Server, damit er im Log steht. `keepalive`: die Meldung
 * kommt auch an, wenn die Seite direkt danach neu lädt. Wirft nie.
 */
export function reportClientError(error: unknown, context: ClientErrorContext): void {
  try {
    const report = buildClientErrorReport(error, context, window.location.pathname);
    const key = `${report.boundary}|${report.name}|${report.message}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) return;
    sent.add(key);
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Melden darf nie selbst scheitern.
  }
}

/** Nur für Tests. */
export function resetClientErrorReportsForTests(): void {
  sent.clear();
}
