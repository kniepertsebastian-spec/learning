import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { createDepartment, DepartmentExistsError, InvalidDepartmentError, listDepartments, listMembersWithDepartment, MAX_DEPARTMENTS, TooManyDepartmentsError } from "@/lib/server/company/departments";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

/** Abteilungen und Mitglieder mit ihrer Abteilung der eigenen Firma. */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const orgId = guard.membership.organizationId;
  const [departments, members] = await Promise.all([listDepartments(orgId), listMembersWithDepartment(orgId)]);
  return NextResponse.json({ departments, members }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let name: string;
  try {
    name = z.object({ name: z.string().max(200) }).parse(await request.json()).name;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    return NextResponse.json(await createDepartment(guard.membership.organizationId, name, guard.membership.userId), { status: 201 });
  } catch (error) {
    if (error instanceof InvalidDepartmentError) return NextResponse.json({ error: "Der Name braucht 2 bis 60 Zeichen." }, { status: 400 });
    if (error instanceof DepartmentExistsError) return NextResponse.json({ error: "Diese Abteilung gibt es schon." }, { status: 409 });
    if (error instanceof TooManyDepartmentsError) return NextResponse.json({ error: `Höchstens ${MAX_DEPARTMENTS} Abteilungen.` }, { status: 409 });
    throw error;
  }
}
