import { NextResponse } from "next/server";
import { DOCUMENT_ROLES } from "@/lib/server/company/access";
import { deleteDocumentImage } from "@/lib/server/company/documents";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const guard = await requireCompanyApi(DOCUMENT_ROLES);
  if (!guard.ok) return guard.response;
  const { id, imageId } = await params;
  if (!UUID.test(id) || !UUID.test(imageId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await deleteDocumentImage(guard.membership.organizationId, id, imageId, guard.membership.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
