import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { addDomain, SsoConfigError } from "@/lib/server/company/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Trägt eine E-Mail-Domain der Firma ein (noch unbestätigt; Anleitung für den DNS-Eintrag steht in der Übersicht). */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const body = z.object({ domain: z.string().min(1).max(253) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    await addDomain(guard.membership.organizationId, guard.membership.userId, body.data.domain);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof SsoConfigError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
