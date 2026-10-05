import { NextResponse } from "next/server";
import { z } from "zod";
import { resendVerificationEmail } from "@/lib/server/account/recovery";
import { checkRecoveryRequestRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { normalizeEmail } from "@/lib/server/email";
import { isMailConfigured } from "@/lib/server/mail/config";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().email().max(254) });

/** Bestätigungslink erneut senden. Antwort immer gleich, Versand nach der Antwort (siehe forgot-password). */
export async function POST(request: Request) {
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Der E-Mail-Versand ist nicht eingerichtet. Bitte wende dich an den Betreiber." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const email = normalizeEmail(parsed.data.email);
  const limit = checkRecoveryRequestRateLimit(clientIp(request.headers), email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  void resendVerificationEmail(email).catch((err) => console.error("Bestätigung erneut senden fehlgeschlagen:", err));
  return NextResponse.json({ ok: true });
}
