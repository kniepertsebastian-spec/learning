import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailWithToken } from "@/lib/server/account/recovery";
import { checkRecoveryTokenRateLimit, clientIp } from "@/lib/server/auth-rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(20).max(200) });

/**
 * E-Mail bestätigen. Bewusst per POST nach einem Klick auf der Seite /verify-email/[token]: ein
 * GET-Link würde schon von Link-Scannern in Postfächern „geöffnet“ und das Token verbrauchen.
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

  if (!(await verifyEmailWithToken(parsed.data.token))) {
    return NextResponse.json({ error: "Der Link ist ungültig oder abgelaufen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
