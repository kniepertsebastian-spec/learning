import { NextResponse } from "next/server";
import { z } from "zod";
import { checkCompanyClaimRateLimit } from "@/lib/server/auth-rate-limit";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { requestCompanyClaim } from "@/lib/server/company/claims";
import { getCompanyMembership } from "@/lib/server/company/access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  companyEmail: z.string().trim().email().max(254),
});

const ERRORS = {
  already_member: [409, "Dein Konto gehört schon zu einem Unternehmen."],
  not_company_email: [400, "Bitte eine Firmen-E-Mail-Adresse verwenden (keine privaten Anbieter wie gmail.com)."],
  invalid_name: [400, "Bitte den Firmennamen angeben."],
  mail_unavailable: [503, "E-Mail-Versand ist nicht eingerichtet, die Bestätigung ist derzeit nicht möglich."],
  send_failed: [502, "Die Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen."],
} as const;

/** Aktuelle Firmenzugehörigkeit des angemeldeten Kontos (oder null). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const membership = await getCompanyMembership(user.id);
  return NextResponse.json(
    { company: membership ? { name: membership.organizationName, role: membership.role } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Privatperson legt ein Unternehmen fest: Firmenname + Firmen-E-Mail. An die Adresse geht ein
 * Bestätigungslink; erst mit dem Klick entsteht die Firma und das Konto wird ihr Firmen-Admin.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const limit = checkCompanyClaimRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const result = await requestCompanyClaim({ userId: user.id, ...parsed.data });
  if (!result.ok) {
    const [status, error] = ERRORS[result.reason];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true });
}
