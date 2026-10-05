import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { checkRegistrationRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { hasPendingInvitationForEmail } from "@/lib/server/company/invitations";
import { normalizeEmail } from "@/lib/server/email";
import { newPasswordSchema } from "@/lib/server/password-policy";

const registerRequestSchema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: newPasswordSchema,
  name: z.string().min(1).optional(),
});

/**
 * Registration is gated by an email allowlist (comma-separated
 * REGISTRATION_ALLOWED_EMAILS env var). Without this, anyone who finds the
 * app can create accounts that trigger live, billed Claude API calls (e.g.
 * via the remediation endpoint) against the deployer's own key - there is no
 * per-user billing or invite system, so open registration means open access
 * to a paid API key. If the env var is unset, registration is closed
 * entirely rather than silently left open. Ausnahme: Wer eine offene,
 * gültige Einladung einer Organisation hat (lib/server/company/invitations.ts),
 * darf sich mit genau dieser E-Mail registrieren.
 */
function isEmailAllowed(email: string): boolean {
  const allowlist = (process.env.REGISTRATION_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(normalizeEmail(email));
}

export async function POST(request: Request) {
  const limit = checkRegistrationRateLimit(clientIp(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = registerRequestSchema.parse(await request.json());

    // Zugelassen: E-Mail auf der Allowlist ODER mit offener, gültiger Einladung einer Organisation.
    if (!isEmailAllowed(body.email) && !(await hasPendingInvitationForEmail(body.email))) {
      return NextResponse.json(
        { error: "Registrierung ist derzeit nur auf Einladung möglich." },
        { status: 403 },
      );
    }

    const db = getDb();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: "E-Mail bereits registriert." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const [user] = await db
      .insert(users)
      .values({ email: body.email, passwordHash, name: body.name })
      .returning({ id: users.id, email: users.email, name: users.name });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Ungültige Anfrage.", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Unerwarteter Serverfehler." }, { status: 500 });
  }
}
