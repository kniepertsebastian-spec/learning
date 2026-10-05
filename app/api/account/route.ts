import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount } from "@/lib/server/account/delete";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { checkAccountActionRateLimit } from "@/lib/server/auth-rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

const BLOCKED_MESSAGES = {
  platform_admin:
    "Plattform-Admin-Konten lassen sich nicht selbst löschen. Die Admin-Rolle muss zuerst entzogen werden.",
  last_company_admin:
    "Du bist der letzte Firmen-Admin deiner Organisation. Übertrage die Rolle zuerst an eine andere Person.",
} as const;

/** Konto und persönliche Daten unwiderruflich löschen. Verlangt das aktuelle Passwort. */
export async function DELETE(request: Request) {
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
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const result = await deleteAccount(user.id, parsed.data.password);
  if (result.ok) return NextResponse.json({ ok: true });
  if (result.reason === "wrong_password") {
    return NextResponse.json({ error: "Das Passwort ist falsch." }, { status: 403 });
  }
  if (result.reason === "not_found") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: BLOCKED_MESSAGES[result.reason] }, { status: 409 });
}
