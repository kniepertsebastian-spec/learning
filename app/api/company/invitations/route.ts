import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkInvitationCreateRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  AlreadyInOrganizationError,
  createInvitation,
  INVITABLE_ROLES,
  listPendingInvitations,
} from "@/lib/server/company/invitations";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(INVITABLE_ROLES as [string, ...string[]]),
});

/** Offene Einladungen der eigenen Organisation (nie Token oder Hash). Nur Firmen-Admin. */
export async function GET() {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;

  const invitations = await listPendingInvitations(guard.membership.organizationId);
  return NextResponse.json({ invitations }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Legt eine Einladung an. Der Link (`invitePath`) steht NUR in dieser Antwort - danach ist er
 * nirgends mehr abrufbar. Es wird keine E-Mail versendet; der Firmen-Admin gibt den Link selbst weiter.
 */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;

  const limit = checkInvitationCreateRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Einladungen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    throw error;
  }

  try {
    const { invitation, token } = await createInvitation({
      organizationId: guard.membership.organizationId,
      createdByUserId: guard.membership.userId,
      email: body.email,
      role: body.role as (typeof INVITABLE_ROLES)[number],
    });
    return NextResponse.json(
      { invitation, invitePath: `/invite/${token}` },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AlreadyInOrganizationError) {
      return NextResponse.json(
        { error: "Diese Person ist bereits Mitglied der Organisation." },
        { status: 409 },
      );
    }
    console.error("Error creating invitation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
