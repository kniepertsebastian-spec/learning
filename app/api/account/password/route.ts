import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword } from "@/lib/server/account/password";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { checkAccountActionRateLimit } from "@/lib/server/auth-rate-limit";
import { newPasswordSchema } from "@/lib/server/password-policy";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});

/** Passwort ändern. Beendet danach ALLE Sitzungen, auch die aktuelle (neu anmelden). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkAccountActionRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." },
      { status: 400 },
    );
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json(
      { error: "Das neue Passwort muss sich vom aktuellen unterscheiden." },
      { status: 400 },
    );
  }

  const result = await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (result === "wrong_password") {
    return NextResponse.json({ error: "Das aktuelle Passwort ist falsch." }, { status: 403 });
  }
  if (result === "not_found") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
