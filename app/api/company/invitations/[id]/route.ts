import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { revokeInvitation } from "@/lib/server/company/invitations";

export const dynamic = "force-dynamic";

/** Widerruft eine offene Einladung der eigenen Organisation. Nur Firmen-Admin. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const revoked = await revokeInvitation(guard.membership.organizationId, id, guard.membership.userId);
  if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
