import { NextResponse } from "next/server";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { cancelInternalCourseJob } from "@/lib/server/internal-courses/service";

export const dynamic = "force-dynamic";

/** Bricht einen laufenden Auftrag der eigenen Firma ab. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await cancelInternalCourseJob(guard.membership.organizationId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
