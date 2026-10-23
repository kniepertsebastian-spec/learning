import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Abmeldelink in der Reaktivierungs-Mail: signiert mit AUTH_SECRET, ohne Anmeldung nutzbar, nur für diese eine Wirkung
 * (Reaktivierungs-Mails abschalten). Kein Ablauf: eine Abmeldung soll auch aus einer alten Mail noch gehen.
 */
function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`reactivation-unsubscribe:${userId}`).digest("base64url");
}

export function unsubscribeToken(userId: string, secret: string | undefined = process.env.AUTH_SECRET): string {
  if (!secret) throw new Error("AUTH_SECRET fehlt");
  return sign(userId, secret);
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string | undefined = process.env.AUTH_SECRET): boolean {
  if (!secret || !token) return false;
  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
