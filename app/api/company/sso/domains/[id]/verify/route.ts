import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { SsoConfigError, verifyDomain } from "@/lib/server/company/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Prüft den DNS-TXT-Eintrag der Domain und bestätigt sie. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const verified = await verifyDomain(guard.membership.organizationId, guard.membership.userId, id);
    return NextResponse.json({ verified });
  } catch (error) {
    if (error instanceof SsoConfigError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
