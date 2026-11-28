/**
 * `pushsubscriptionchange` im Service Worker (app/sw.ts): Der Browser hat das Push-Abo erneuert oder verworfen (Firefox,
 * Safari/iOS rotieren den Endpunkt im Hintergrund). Ohne Meldung an den Server liefe jede Erinnerung ins Leere. Reine
 * Funktion mit übergebenen Abhängigkeiten, damit sie ohne Service Worker testbar ist.
 */

import { urlBase64ToUint8Array } from "./vapid-key";

/** Die Teile von PushSubscription, die hier gebraucht werden. */
export interface SubscriptionLike {
  endpoint: string;
  options?: { applicationServerKey?: ArrayBuffer | null; userVisibleOnly?: boolean } | null;
  toJSON(): unknown;
}

export interface ResubscribeDeps {
  /** `event.oldSubscription` (fehlt in manchen Browsern). */
  oldSubscription: SubscriptionLike | null | undefined;
  /** `event.newSubscription`: Firefox liefert das neue Abo gleich mit. */
  newSubscription: SubscriptionLike | null | undefined;
  /** `registration.pushManager.subscribe`. */
  subscribe: (options: { userVisibleOnly: true; applicationServerKey: BufferSource }) => Promise<SubscriptionLike>;
  fetch: (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "json">>;
}

export type ResubscribeResult = "renewed" | "no-key" | "failed";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Öffentlicher VAPID-Schlüssel: aus dem alten Abo, sonst vom Server (braucht die Sitzung der Person, gleicher Ursprung). */
async function applicationServerKey(deps: ResubscribeDeps): Promise<BufferSource | null> {
  const fromOld = deps.oldSubscription?.options?.applicationServerKey;
  if (fromOld && fromOld.byteLength > 0) return fromOld;
  const response = await deps.fetch("/api/push/preferences", { method: "GET", credentials: "same-origin" });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { publicKey?: unknown } | null;
  return typeof data?.publicKey === "string" && data.publicKey ? urlBase64ToUint8Array(data.publicKey) : null;
}

/**
 * Holt das neue Abo (mitgeliefert oder neu angefordert), meldet es dem Server und meldet das alte ab. Wirft nie: ein Fehler
 * hier darf den Service Worker nicht stören; im schlimmsten Fall schaltet die Person Push in den Einstellungen neu ein.
 */
export async function resubscribePush(deps: ResubscribeDeps): Promise<ResubscribeResult> {
  try {
    let subscription = deps.newSubscription ?? null;
    if (!subscription) {
      // Ohne altes Abo gab es nie ein Opt-in auf diesem Gerät: nichts von selbst neu anlegen.
      if (!deps.oldSubscription) return "no-key";
      const key = await applicationServerKey(deps);
      if (!key) return "no-key";
      subscription = await deps.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    const saved = await deps.fetch("/api/push/subscribe", { method: "POST", headers: JSON_HEADERS, credentials: "same-origin", body: JSON.stringify(subscription.toJSON()) });
    if (!saved.ok) return "failed";
    const oldEndpoint = deps.oldSubscription?.endpoint;
    if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
      await deps
        .fetch("/api/push/subscribe", { method: "DELETE", headers: JSON_HEADERS, credentials: "same-origin", body: JSON.stringify({ endpoint: oldEndpoint }) })
        .catch(() => undefined);
    }
    return "renewed";
  } catch {
    return "failed";
  }
}

/** Liest den Text einer Push-Nachricht, ohne zu werfen (kaputte Kodierung o. Ä.): dann zeigt der Handler den neutralen Rückfall. */
export function readPushText(data: { text(): string } | null | undefined): string | null {
  if (!data) return null;
  try {
    return data.text();
  } catch {
    return null;
  }
}

/** Ursprung einer Fenster-Adresse; bei ungewöhnlichen Adressen (about:blank, kaputt) null statt einer Ausnahme. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
