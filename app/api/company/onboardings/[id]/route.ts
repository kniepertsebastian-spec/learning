import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { MAX_ASSIGNEES } from "@/lib/server/company/assignments";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { archiveOnboardingPlan, NotAMemberError, PlanNotFoundError, startOnboarding, UnknownCourseError } from "@/lib/server/company/onboardings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const startSchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(MAX_ASSIGNEES) });

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });

/** Weist den Plan Personen der eigenen Firma zu (alle Lernpfade des Plans, Onboarding „offen“). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);
  let body: z.infer<typeof startSchema>;
  try {
    body = startSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const result = await startOnboarding({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, planId: id, userIds: body.userIds });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof NotAMemberError) return NextResponse.json({ error: "Mindestens eine Person gehört nicht zur Firma." }, { status: 400 });
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Mindestens ein Lernpfad des Plans ist nicht mehr verfügbar." }, { status: 409 });
    throw error;
  }
}

/** Archiviert einen Plan der eigenen Firma (laufende Onboardings und Zuweisungen bleiben). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await archiveOnboardingPlan(guard.membership.organizationId, id, guard.membership.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
