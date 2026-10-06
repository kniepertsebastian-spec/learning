import { NextResponse } from "next/server";
import { z } from "zod";
import { DOCUMENT_ROLES } from "@/lib/server/company/access";
import { deleteCompanyDocument } from "@/lib/server/company/documents";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

/** Löscht ein Firmendokument der eigenen Organisation samt Dateiinhalt. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await deleteCompanyDocument(guard.membership.organizationId, id, guard.membership.userId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
