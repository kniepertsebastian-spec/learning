/**
 * Hält das `beforeinstallprompt`-Ereignis des Browsers fest: es feuert oft, bevor eine Seite mit Hinweis geöffnet ist.
 * `ServiceWorkerManager` (immer montiert) ruft `startInstallCapture()`, die Banner lesen den Stand.
 */
import { INSTALL_DISMISSED_KEY, INSTALL_INSTALLED_KEY, installOffer, isIosSafari, type InstallOffer } from "@/lib/pwa/install";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Speicher gesperrt: der Hinweis erscheint dann ggf. öfter, sonst nichts.
  }
}

export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // eigener Button statt der Mini-Leiste des Browsers
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    write(INSTALL_INSTALLED_KEY, new Date().toISOString());
    notify();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentInstallOffer(now: Date = new Date()): InstallOffer {
  if (typeof window === "undefined") return null;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installOffer({
    standalone: Boolean(standalone),
    installedAt: read(INSTALL_INSTALLED_KEY),
    dismissedAt: read(INSTALL_DISMISSED_KEY),
    now,
    canPrompt: deferred !== null,
    iosSafari: isIosSafari(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0),
  });
}

/** Zeigt den Installationsdialog des Browsers. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  if (choice.outcome === "dismissed") write(INSTALL_DISMISSED_KEY, new Date().toISOString());
  notify();
  return choice.outcome;
}

/** „Nicht jetzt“: 30 Tage Ruhe. */
export function dismissInstallOffer(): void {
  write(INSTALL_DISMISSED_KEY, new Date().toISOString());
  notify();
}
