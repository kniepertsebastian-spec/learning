import type { PushPayload } from "@/lib/push/logic";
import { vapidConfig } from "./config";

/** Wohin eine Nachricht geht: Adresse des Push-Dienstes und die Schlüssel des Geräts. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

/** „gone“: das Abo gibt es nicht mehr (404/410), „error“: es hat gerade nicht geklappt. */
export type PushOutcome = "ok" | "gone" | "error";
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<PushOutcome>;

/** Echter Versand über die Bibliothek `web-push` (VAPID, Verschlüsselung nach RFC 8291). In Tests ersetzt ein Fake diese Funktion. */
export const webPushSender: PushSender = async (target, payload) => {
  const config = vapidConfig();
  if (!config) return "error";
  const webpush = await import("web-push");
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.authKey } }, JSON.stringify(payload), {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: 12 * 3600,
      urgency: "normal",
      timeout: 10_000,
    });
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
};
