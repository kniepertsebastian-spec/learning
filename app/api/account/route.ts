import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount, type DeleteConfirmation } from "@/lib/server/account/delete";
import { auth } from "@/lib/server/auth";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { checkAccountActionRateLimit } from "@/lib/server/auth-rate-limit";
import { sessionAuthenticatedAt } from "@/lib/server/session-auth-time";

export const dynamic = "force-dynamic";

/** Passwort, oder bei Konten mit Firmen-Anmeldung die eigene E-Mail-Adresse (Aufgabe 09). */
const bodySchema = z.union([
  z.object({ password: z.string().min(1).max(200) }),
  z.object({ email: z.string().min(1).max(320) }),
]);

const REFUSED = {
  wrong_password: { status: 403, error: "Das Passwort ist falsch." },
  password_required: { status: 403, error: "Bitte bestätige mit deinem Passwort." },
  wrong_email: { status: 403, error: "Die E-Mail-Adresse stimmt nicht mit deinem Konto überein." },
  stale_session: {
    status: 403,
    error: "Deine Anmeldung liegt zu lange zurück. Bitte melde dich ab, erneut über dein Firmenkonto an und lösche dann das Konto.",
  },
} as const;

const BLOCKED_MESSAGES = {
  platform_admin:
    "Plattform-Admin-Konten lassen sich nicht selbst löschen. Die Admin-Rolle muss zuerst entzogen werden.",
  last_company_admin:
    "Du bist der letzte Firmen-Admin deiner Organisation. Übertrage die Rolle zuerst an eine andere Person.",
} as const;

/**
 * Konto und persönliche Daten unwiderruflich löschen. Verlangt das aktuelle Passwort; ein Konto mit Firmen-Anmeldung (SSO) kann
 * stattdessen die eigene E-Mail-Adresse eintippen, wenn die Anmeldung frisch ist (Aufgabe 09).
 */
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

  let confirmation: DeleteConfirmation;
  if ("password" in parsed.data) {
    confirmation = { password: parsed.data.password };
  } else {
    confirmation = { email: parsed.data.email, authenticatedAt: sessionAuthenticatedAt(await auth()) };
  }

  const result = await deleteAccount(user.id, confirmation);
  if (result.ok) return NextResponse.json({ ok: true });
  const reason = result.reason;
  if (reason === "not_found") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (reason === "platform_admin" || reason === "last_company_admin") {
    return NextResponse.json({ error: BLOCKED_MESSAGES[reason] }, { status: 409 });
  }
  return NextResponse.json({ error: REFUSED[reason].error }, { status: REFUSED[reason].status });
}
