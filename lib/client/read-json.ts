/**
 * Liest eine API-Antwort als JSON. Kommt statt JSON eine HTML-Seite (z. B. die Fehlerseite des Cloudflare-Tunnels bei
 * Zeitüberschreitung 524, 502 während eines Deploys, 413 bei zu großer Anfrage), entsteht eine verständliche Meldung statt
 * „Unexpected token '<' … is not valid JSON“.
 */
export class UnexpectedResponseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "UnexpectedResponseError";
  }
}

export function describeNonJsonStatus(status: number, de = true): string {
  if (status === 524 || status === 504 || status === 408) {
    return de
      ? `Der Server hat nicht rechtzeitig geantwortet (Zeitüberschreitung, Status ${status}). Bitte gleich noch einmal versuchen.`
      : `The server did not respond in time (timeout, status ${status}). Please try again in a moment.`;
  }
  if (status === 502 || status === 503 || status === 521 || status === 522 || status === 523 || status === 530) {
    return de
      ? `Der Server ist gerade nicht erreichbar (Status ${status}), vermutlich wird er neu gestartet. Bitte in einer Minute erneut versuchen.`
      : `The server is currently unreachable (status ${status}), probably restarting. Please try again in a minute.`;
  }
  if (status === 413) return de ? "Die Anfrage ist zu groß (Status 413)." : "The request is too large (status 413).";
  if (status === 404) return de ? "Die Schnittstelle wurde nicht gefunden (Status 404). Bitte die Seite neu laden." : "Endpoint not found (status 404). Please reload the page.";
  return de ? `Unerwartete Antwort vom Server (Status ${status}).` : `Unexpected response from the server (status ${status}).`;
}

export async function readJson<T>(response: Response, de = true): Promise<T> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new UnexpectedResponseError(response.status, describeNonJsonStatus(response.status, de));
  try {
    return (await response.json()) as T;
  } catch {
    throw new UnexpectedResponseError(response.status, describeNonJsonStatus(response.status, de));
  }
}
