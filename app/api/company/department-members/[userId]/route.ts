import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { DepartmentNotFoundError, NotAMemberError, setMemberDepartment } from "@/lib/server/company/departments";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ordnet ein Mitglied der eigenen Firma einer Abteilung zu (`departmentId: null` = keine). Nur Firmen-Admin. */
export async function PUT(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const { userId } = await params;
  if (!UUID.test(userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let departmentId: string | null;
  try {
    departmentId = z.object({ departmentId: z.string().uuid().nullable() }).parse(await request.json()).departmentId;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    return NextResponse.json(await setMemberDepartment({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, userId, departmentId }));
  } catch (error) {
    if (error instanceof NotAMemberError || error instanceof DepartmentNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
