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

/**
 * Caches, die beim Aktivieren eines neuen Service Workers weg können: alles außer der Allowlist (eigene Caches plus der
 * aktive Precache/Runtime-Cache von Serwist). Erfasst den früheren gemeinsamen Cache (LEGACY_CACHE) ebenso wie künftig
 * umbenannte Caches, die sonst für immer Speicher belegen würden.
 */
export function staleCacheNames(existing: readonly string[], keep: readonly string[]): string[] {
  const allowed = new Set(keep);
  return existing.filter((name) => !allowed.has(name));
}

export const PAGES_CACHE_MAX_ENTRIES = 50;
export const PAGES_CACHE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
export const ASSETS_CACHE_MAX_ENTRIES = 200;
export const ASSETS_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Navigationen dorthin laufen nie über den Seiten-Cache: Bereiche mit Daten anderer Personen (Admin, Firma, Reviewer,
 * öffentliche Nachweis-Prüfung), persönliche Konto-, Profil-, Karriere-, Prüfungsplan- und Lernprofilseiten sowie alle
 * Seiten, deren Adresse ein Token enthalten kann (Anmeldung, Passwort-Reset, Einladungen, E-Mail-Bestätigung, Abmeldung
 * von E-Mails).
 */
const UNCACHED_PREFIXES = [
  "/admin",
  "/company",
  "/confirm-company",
  "/reviewer",
  "/account",
  "/profile",
  "/career",
  "/exams",
  "/how-i-learn",
  "/certificates",
  "/verify",
  "/login",
  "/register",
  "/sso",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/resend-verification",
  "/invite",
  "/reviewer-invite",
  "/unsubscribe",
];

/**
 * Persönliche Auswertungen innerhalb eines Kurses: Verlauf, Schwächen, Abschlussprüfung und Neustart. Die eigentlichen
 * Lernseiten (`/cert/[id]`, Kapitel, Sessions) bleiben offline nutzbar und dürfen in den Seiten-Cache.
 */
const UNCACHED_CERT_SUBPATH = /^\/cert\/[^/]+\/(history|weaknesses|final-exam|restart)(\/|$)/;

export function isUncachedPagePath(pathname: string): boolean {
  return UNCACHED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || UNCACHED_CERT_SUBPATH.test(pathname);
}

/**
 * Eigenes Signal: eine Seite mit `X-SW-Cache: no-store` landet nie im Seiten-Cache, unabhängig von Cache-Control.
 * Vorbereiteter Sicherheits-Hook: derzeit setzt ihn keine Route, die Sperrliste oben deckt alle bekannten Fälle ab. Eine
 * neue Seite mit sensiblen Daten außerhalb dieser Präfixe lässt sich damit ausnehmen, ohne den Service Worker zu ändern:
 * Antwort-Header `X-SW-Cache: no-store` setzen (next.config.ts `headers()` für den Pfad, proxy.ts oder Route-Handler).
 */
export const SW_CACHE_HEADER = "X-SW-Cache";

/**
 * Next.js setzt diesen Wert auf JEDE dynamisch gerenderte Seite. Er sagt deshalb nichts über die einzelne Seite aus und
 * sperrt sie nicht für den Seiten-Cache (sonst wäre der Cache leer); Schutz geben dort die Sperrliste oben und das Leeren
 * beim Logout/Nutzerwechsel. Ändert Next.js den Wert, greift die strenge Regel: dann wird eher zu wenig als zu viel gecacht.
 */
const NEXT_DYNAMIC_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

const directives = (cacheControl: string) =>
  cacheControl
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");

const NEXT_DYNAMIC_DIRECTIVES = directives(NEXT_DYNAMIC_CACHE_CONTROL);

/**
 * Darf eine Seiten-Antwort in den Seiten-Cache? Nein bei `X-SW-Cache: no-store` und bei bewusst gesetztem `no-store` oder
 * `private` (jeder Cache-Control-Wert außer dem Next.js-Standard für dynamische Seiten).
 */
export function isPageResponseCacheable(headers: Pick<Headers, "get">): boolean {
  if (headers.get(SW_CACHE_HEADER)?.trim().toLowerCase() === "no-store") return false;
  const cacheControl = headers.get("Cache-Control");
  if (!cacheControl) return true;
  const normalized = directives(cacheControl);
  if (normalized === NEXT_DYNAMIC_DIRECTIVES) return true;
  return !normalized.split(",").some((d) => /^(no-store|private)(=|$)/.test(d));
}

/**
 * Erkennt Next.js App-Router RSC-Anfragen (`RSC: 1` Header oder `?_rsc=` Query-Parameter).
 * Diese dürfen nie im Asset- oder Dokument-Cache landen und laufen immer direkt über das Netzwerk.
 */
export function isRscRequest(request: Pick<Request, "headers">, url: Pick<URL, "searchParams">): boolean {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}
