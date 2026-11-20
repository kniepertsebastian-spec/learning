/**
 * Antwort einer eigenen API lesen, auch wenn sie kein JSON ist. Vor der App stehen Cloudflare und Caddy: läuft eine Anfrage
 * zu lange (Cloudflare bricht nach etwa 100 Sekunden mit 524 ab) oder ist sie zu groß (413), kommt eine HTML-Fehlerseite statt
 * JSON. response.json() meldet dann nur „Unexpected token '<'“; hier entsteht stattdessen ein Fehler mit dem Status.
 */
export class NonJsonResponseError extends Error {
  constructor(readonly status: number) {
    super(`Unerwartete Antwort vom Server (Status ${status}).`);
    this.name = "NonJsonResponseError";
  }
}

/** Status, bei denen ein Proxy oder Gateway abgebrochen hat (Zeitüberschreitung, Server nicht erreichbar). */
export function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 520 || status === 522 || status === 523 || status === 524;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NonJsonResponseError(response.status);
  }
}
