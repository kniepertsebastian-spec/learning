import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { EncryptionUnavailableError, getSsoView, saveSsoConfig, SsoConfigError } from "@/lib/server/company/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Nur der Firmen-Admin: die Anmeldung betrifft alle Mitglieder.
const ADMIN_ONLY = ["company_admin"] as const;

const groups = z.array(z.string().max(200)).max(50);
const putSchema = z.object({
  issuer: z.string().min(1).max(300),
  clientId: z.string().min(1).max(300),
  clientSecret: z.string().max(500).nullable().optional(),
  groupsClaim: z.string().max(100).default("groups"),
  roleMappings: z.object({ company_admin: groups, mentor: groups, learner: groups }),
  enabled: z.boolean(),
  enforceSso: z.boolean(),
});

/** Einstellungen der Firmenkonto-Anmeldung. Nie das Geheimnis. */
export async function GET() {
  const guard = await requireCompanyApi(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return NextResponse.json(await getSsoView(guard.membership.organizationId), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const guard = await requireCompanyApi(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const body = putSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const view = await saveSsoConfig({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, ...body.data });
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SsoConfigError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof EncryptionUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
