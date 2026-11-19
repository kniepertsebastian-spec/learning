import { urlBase64ToUint8Array } from "@/lib/pwa/vapid-key";

/**
 * Web Push im Browser (docs/roadmaps/archiv/roadmap_pwa.md, Phase 6). Nichts hier fragt von selbst nach einer Berechtigung: `enablePush`
 * läuft nur als Antwort auf den Klick „Auf diesem Gerät benachrichtigen“ in den Einstellungen.
 */

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone/iPad außerhalb der installierten App: dort gibt es Push erst nach „Zum Home-Bildschirm“ (ab iOS 16.4). */
export function isIosWithoutInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export type EnableResult = "ok" | "denied" | "unsupported" | "failed";

/** Fragt (jetzt, auf Klick) die Berechtigung, abonniert und meldet das Abo dem Server. */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
    if (!response.ok) {
      await subscription.unsubscribe().catch(() => false);
      return "failed";
    }
    return "ok";
  } catch {
    return "failed";
  }
}

/** Schaltet dieses Gerät aus: Server und Browser. Ohne Abo tut es nichts. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}

/** Beim Abmelden: das Gerät gehört nicht mehr dieser Person. Best effort, darf die Abmeldung nie aufhalten oder abbrechen. */
export async function removePushOnSignOut(): Promise<void> {
  try {
    await Promise.race([disablePush(), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    // ignorieren
  }
}
