import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { removeDomain, SsoConfigError } from "@/lib/server/company/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await removeDomain(guard.membership.organizationId, guard.membership.userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SsoConfigError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
