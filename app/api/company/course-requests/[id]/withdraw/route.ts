import { NextResponse } from "next/server";
import { REQUEST_ROLES } from "@/lib/server/company/access";
import { NotWithdrawableError, withdrawCourseRequest } from "@/lib/server/company/course-requests";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

/** Die Firma zieht eine eigene, noch offene Anfrage zurück. Fremde und unbekannte Anfragen: 404. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(REQUEST_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const ok = await withdrawCourseRequest({ organizationId: guard.membership.organizationId, requestId: id, userId: guard.membership.userId });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof NotWithdrawableError) {
      return NextResponse.json({ error: "Diese Anfrage ist nicht mehr offen und lässt sich nicht zurückziehen." }, { status: 409 });
    }
    throw error;
  }
}
