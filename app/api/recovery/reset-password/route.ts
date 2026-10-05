import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordWithToken } from "@/lib/server/account/recovery";
import { checkRecoveryTokenRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { newPasswordSchema } from "@/lib/server/password-policy";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: newPasswordSchema,
});

/** Neues Passwort per Reset-Link. Beendet danach alle Sitzungen. */
export async function POST(request: Request) {
  const limit = checkRecoveryTokenRateLimit(clientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." }, { status: 400 });
  }

  const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
  if (!ok) {
    return NextResponse.json({ error: "Der Link ist ungültig oder abgelaufen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
