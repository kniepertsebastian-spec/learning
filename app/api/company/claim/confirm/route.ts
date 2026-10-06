import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRecoveryTokenRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { confirmCompanyClaim } from "@/lib/server/company/claims";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(20).max(200) });

/**
 * Firmen-E-Mail bestätigen. Wie die E-Mail-Bestätigung per POST nach einem Klick auf der Seite
 * /confirm-company/[token] (ein GET würde schon von Link-Scannern verbraucht). Das Token ersetzt
 * die Anmeldung: wer den Link aus dem Firmenpostfach hat, kontrolliert die Adresse.
 */
export async function POST(request: Request) {
  const limit = checkRecoveryTokenRateLimit(clientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const result = await confirmCompanyClaim(parsed.data.token);
  if (!result.ok) {
    return result.reason === "already_member"
      ? NextResponse.json({ error: "Dein Konto gehört schon zu einem Unternehmen." }, { status: 409 })
      : NextResponse.json({ error: "Der Link ist ungültig oder abgelaufen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, organizationName: result.organizationName });
}
