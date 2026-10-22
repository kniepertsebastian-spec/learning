/**
 * Cache-Regeln des Service Workers (roadmap_pwa Phase 3). Reine Funktionen ohne Abhängigkeiten, damit sie sowohl im
 * Service Worker (app/sw.ts, relativer Import) als auch in Tests und Client-Code nutzbar sind.
 */

/** Seiten (Navigationen): gehören genau einem Nutzer, werden beim Logout und Nutzerwechsel gelöscht. */
export const PAGES_CACHE = "pages-cache";
/** Statische Dateien (Stil, Skript, Bild, Schrift): hashed, nicht nutzerbezogen. */
export const ASSETS_CACHE = "assets-cache";
/** Vor Phase 3 gemeinsamer Cache für beides; wird beim Aktivieren des neuen Service Workers entfernt. */
export const LEGACY_CACHE = "ui-cache";

export const PAGES_CACHE_MAX_ENTRIES = 50;
export const PAGES_CACHE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
export const ASSETS_CACHE_MAX_ENTRIES = 200;
export const ASSETS_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Bereiche mit Daten anderer Personen: Navigationen dorthin laufen nie über den Seiten-Cache. */
const UNCACHED_PREFIXES = ["/admin", "/company", "/confirm-company"];

export function isUncachedPagePath(pathname: string): boolean {
  return UNCACHED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
