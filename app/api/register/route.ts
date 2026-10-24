import { getEvaluationGroup } from "@/lib/server/psrp/evaluation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { checkRegistrationRateLimit, clientIp } from "@/lib/server/auth-rate-limit";
import { hasPendingInvitationForEmail } from "@/lib/server/company/invitations";
import { hasPendingReviewerInvitationForEmail } from "@/lib/server/reviewers/service";
import { normalizeEmail } from "@/lib/server/email";
import { sendVerificationEmail } from "@/lib/server/account/recovery";
import { isMailConfigured } from "@/lib/server/mail/config";
import { cleanCompanyName, createOrganizationForUser, isCompanyEmail, requestCompanyClaim } from "@/lib/server/company/claims";
import { newPasswordSchema } from "@/lib/server/password-policy";

const registerRequestSchema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: newPasswordSchema,
  name: z.string().min(1).optional(),
  // Privatperson (Standard) oder Unternehmen: dann ist die E-Mail die Firmen-Adresse, und der
  // Firmenname ist Pflicht. Die Firma entsteht erst nach Bestätigung per Link (company/claims.ts).
  accountType: z.enum(["private", "company"]).default("private"),
  companyName: z.string().max(200).optional(),
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
    if (!isEmailAllowed(body.email) && !(await hasPendingInvitationForEmail(body.email)) && !(await hasPendingReviewerInvitationForEmail(body.email))) {
      return NextResponse.json(
        { error: "Registrierung ist derzeit nur auf Einladung möglich." },
        { status: 403 },
      );
    }

    const companyName = body.accountType === "company" ? cleanCompanyName(body.companyName ?? "") : "";
    if (body.accountType === "company") {
      if (!companyName) {
        return NextResponse.json({ error: "Bitte den Firmennamen angeben." }, { status: 400 });
      }
      if (!isCompanyEmail(body.email)) {
        return NextResponse.json(
          { error: "Für ein Unternehmen bitte die Firmen-E-Mail-Adresse verwenden (keine privaten Anbieter wie gmail.com)." },
          { status: 400 },
        );
      }
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
    // Ist der E-Mail-Versand eingerichtet, muss die Adresse per Link bestätigt werden, bevor die
    // Anmeldung klappt. Ohne Versand gäbe es keinen Weg zur Bestätigung: dann gilt sie als bestätigt.
    const verificationRequired = isMailConfigured();
    const [user] = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash,
        name: body.name,
        emailVerifiedAt: verificationRequired ? null : new Date(),
      })
      .returning({ id: users.id, email: users.email, name: users.name });
    // PSRP-HR Phase 5: stabile Evaluationsgruppe bei der Registrierung festlegen.
    await getEvaluationGroup(user.id).catch((err) => console.error("Gruppenzuteilung fehlgeschlagen:", err));

    if (body.accountType === "company") {
      if (verificationRequired) {
        // Die Bestätigung der Firmen-Adresse bestätigt zugleich das Konto und legt die Firma an.
        // Scheitert der Versand, geht stattdessen die normale Bestätigung raus; die Firma lässt
        // sich dann in den Kontoeinstellungen festlegen.
        void requestCompanyClaim({ userId: user.id, companyName, companyEmail: user.email })
          .then((r) => (r.ok ? true : sendVerificationEmail(user.id, user.email)))
          .catch((err) => console.error("Firmen-Bestätigung fehlgeschlagen:", err));
      } else {
        await createOrganizationForUser(user.id, companyName);
      }
    } else if (verificationRequired) {
      // Nach der Antwort: ein Fehler beim Versand verhindert die Registrierung nicht
      // („Bestätigung erneut senden“ bleibt möglich).
      void sendVerificationEmail(user.id, user.email).catch((err) =>
        console.error("Bestätigungs-E-Mail fehlgeschlagen:", err),
      );
    }

    return NextResponse.json({ user, verificationRequired }, { status: 201 });
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
