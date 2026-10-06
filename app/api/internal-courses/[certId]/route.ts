import { NextResponse } from "next/server";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { discardInternalCourseDraft } from "@/lib/server/internal-courses/service";

export const dynamic = "force-dynamic";

/** Verwirft einen noch nicht freigegebenen Entwurf der eigenen Firma (fremde und freigegebene: 404). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(certId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await discardInternalCourseDraft(guard.membership.organizationId, certId, guard.membership.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
