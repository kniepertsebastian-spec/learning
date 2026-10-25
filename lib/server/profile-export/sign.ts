import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { LearningProfilePayload } from "@/lib/server/db/schema";

/**
 * Fälschungsschutz des Lernprofil-PDFs: eine HMAC-Signatur (Schlüssel: AUTH_SECRET) über Kennung, Person, Ausstellungszeit und den Inhalt.
 * Der Prüfcode im PDF ist der Anfang dieser Signatur. Wer den Inhalt ändert (anderer Kursname, anderes Datum), bekommt einen anderen Code;
 * ohne den Schlüssel lässt sich keiner berechnen. Die Prüfseite rechnet nach und zeigt den gespeicherten Inhalt zum Vergleich.
 */

/** Stabile Darstellung (Schlüssel sortiert), damit derselbe Inhalt immer dieselbe Signatur ergibt. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  return value;
}

export function payloadHash(payload: LearningProfilePayload): string {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

export function signProfile(input: { id: string; userId: string; issuedAt: Date; payload: LearningProfilePayload }, secret: string | undefined = process.env.AUTH_SECRET): string {
  if (!secret) throw new Error("AUTH_SECRET fehlt");
  return createHmac("sha256", secret).update(`${input.id}|${input.userId}|${input.issuedAt.toISOString()}|${payloadHash(input.payload)}`).digest("base64url");
}

/** Prüfcode für das PDF: die ersten 20 Zeichen der Signatur in Vierergruppen („ABCD-EFGH-…“), leicht abzutippen. */
export function verificationCode(signature: string): string {
  return (signature.replace(/[^A-Za-z0-9]/g, "").slice(0, 20).toUpperCase().match(/.{1,4}/g) ?? []).join("-");
}

export function verifyProfile(input: { id: string; userId: string; issuedAt: Date; payload: LearningProfilePayload; signature: string }, secret: string | undefined = process.env.AUTH_SECRET): boolean {
  if (!secret) return false;
  const expected = Buffer.from(signProfile(input, secret));
  const given = Buffer.from(input.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
