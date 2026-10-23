/**
 * Offline führen interne Links zu einer harten Navigation (roadmap_pwa Phase 2): Ein Next-Link würde RSC-Anfragen stellen,
 * die ohne Netz ins Leere laufen; die harte Navigation lässt den Service Worker antworten (Cache oder Offline-Seite).
 * Gibt das Ziel (Pfad mit Query) zurück, oder null, wenn der Klick normal behandelt werden soll.
 */
export function hardNavigationTarget(
  click: { href: string | null; target: string | null; download: boolean; button: number; modified: boolean; defaultPrevented: boolean },
  origin: string,
  online: boolean,
): string | null {
  if (online || click.defaultPrevented || click.button !== 0 || click.modified || click.download) return null;
  if (!click.href || (click.target && click.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(click.href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
