const KEY = "proofpath-last-user";

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Zuletzt angemeldeter Nutzer auf diesem Gerät (nur die ID). `/offline` hat offline keine Sitzung und weiß damit, welche
 * Pakete aus IndexedDB zu zeigen sind. Beim Logout wird die ID entfernt.
 */
export function getLastUserId(store: Store | null = defaultStore()): string | null {
  try {
    return store?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function setLastUserId(userId: string, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(KEY, userId);
  } catch {
    // ohne Speicher gibt es offline keinen Einstieg - sonst nichts
  }
}

export function clearLastUserId(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // nichts zu entfernen
  }
}
