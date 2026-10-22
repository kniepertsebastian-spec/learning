const RELOAD_KEY = "proofpath-chunk-reload";

/** Veraltete Skript-Chunks nach einem Deploy: Webpack-„ChunkLoadError“ bzw. fehlgeschlagener dynamischer Import. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && /Loading (CSS )?chunk [^ ]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(message);
}

interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Lädt bei einem Chunk-Fehler genau einmal neu (die neue Version bringt die richtigen Chunks mit). Schlägt es danach wieder
 * fehl, bleibt es bei der Fehlerseite - keine Reload-Schleife. Gibt zurück, ob neu geladen wird.
 */
export function reloadOnceForChunkError(error: unknown, storage: FlagStorage, reload: () => void, now = Date.now()): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (last && now - last < 60_000) return false; // eben erst neu geladen, ohne Erfolg
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false; // ohne Speicher keine Garantie gegen Schleifen
  }
  reload();
  return true;
}
