/**
 * Prüft einen von der Firma mitgebrachten KI-Schlüssel (BYOK) mit einer billigen Abfrage der Modellliste,
 * bevor er gespeichert wird. Der Schlüssel geht nur im Header an den festen Google-Host und taucht nie in
 * Adressen, Logs oder Fehlermeldungen auf. Reine Funktion ohne Datenbank, der Abruf lässt sich ersetzen.
 */
export type KeyCheck = { ok: true } | { ok: false; reason: "invalid" | "unreachable" };

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";

/** Grobe Form: keine Leerzeichen, vernünftige Länge. Echte Gültigkeit prüft erst der Abruf. */
export function looksLikeApiKey(key: string): boolean {
  return /^[A-Za-z0-9_\-.]{20,200}$/.test(key);
}

export async function checkGeminiKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<KeyCheck> {
  try {
    const res = await fetchImpl(MODELS_URL, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true };
    // 400 (API_KEY_INVALID), 401, 403: der Schlüssel ist falsch oder gesperrt. Alles andere: Google nicht zuverlässig erreichbar.
    if ([400, 401, 403].includes(res.status)) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
