/** Offline-Einstieg (roadmap_pwa Phase 2). Beide Seiten sind vorab im Precache und enthalten nie Nutzerdaten. */
export const OFFLINE_FALLBACK_PATH = "/~offline";
export const OFFLINE_HOME_PATH = "/offline";

/**
 * Pfade, die ohne Anmeldedaten gerendert werden: Das Layout zeigt dort keinen Nutzer (kein Menü, keine E-Mail), damit die
 * vorab zwischengespeicherte Fassung für jeden Nutzer dieses Geräts gleich ist und nach einem Logout nichts verrät.
 */
export function isOfflineShellPath(pathname: string): boolean {
  return pathname === OFFLINE_FALLBACK_PATH || pathname === OFFLINE_HOME_PATH || pathname.startsWith(`${OFFLINE_HOME_PATH}/`);
}
