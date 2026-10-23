/** Entscheidungen rund um den Installationshinweis (roadmap_pwa Phase 5), ohne Browser-Zugriff und damit testbar. */

export const INSTALL_PAUSE_DAYS = 30;
export const INSTALL_DISMISSED_KEY = "certstudy-install-dismissed-at";
export const INSTALL_INSTALLED_KEY = "certstudy-installed-at";

export type InstallOffer = "native" | "ios" | null;

/** Safari auf iPhone/iPad (auch iPadOS, das sich als Mac meldet); andere iOS-Browser zeigen den Weg anders. */
export function isIosSafari(ua: string, platform: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
}

/**
 * Was gezeigt wird: der eigene Button (Browser hat `beforeinstallprompt` gemeldet), die iOS-Anleitung oder nichts.
 * Nichts, wenn die App schon läuft oder installiert ist oder der Hinweis vor weniger als 30 Tagen abgelehnt wurde.
 */
export function installOffer(input: { standalone: boolean; installedAt: string | null; dismissedAt: string | null; now: Date; canPrompt: boolean; iosSafari: boolean }): InstallOffer {
  if (input.standalone || input.installedAt) return null;
  if (input.dismissedAt) {
    const since = input.now.getTime() - new Date(input.dismissedAt).getTime();
    if (Number.isFinite(since) && since < INSTALL_PAUSE_DAYS * 86_400_000) return null;
  }
  if (input.canPrompt) return "native";
  if (input.iosSafari) return "ios";
  return null;
}
