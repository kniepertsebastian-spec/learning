import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  CoursesNotCompletedError,
  NotAllowedToSetStatusError,
  OnboardingNotFoundError,
  setOnboardingStatus,
  StatusFinalError,
} from "@/lib/server/company/onboardings";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({ status: z.enum(["discussed", "reviewed"]) });

/** Setzt den Stand eines Onboardings (nur Mentor des Plans oder Firmen-Admin). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const status = await setOnboardingStatus({
      organizationId: guard.membership.organizationId,
      actorUserId: guard.membership.userId,
      actorRole: guard.membership.role,
      onboardingId: id,
      status: body.status,
    });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof OnboardingNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof NotAllowedToSetStatusError) return NextResponse.json({ error: "Nur der Mentor dieses Plans oder ein Firmen-Admin darf den Stand setzen." }, { status: 403 });
    if (error instanceof StatusFinalError) return NextResponse.json({ error: "Das Onboarding ist bereits geprüft." }, { status: 409 });
    if (error instanceof CoursesNotCompletedError) return NextResponse.json({ error: "Geprüft ist erst möglich, wenn alle Lernpfade des Plans abgeschlossen sind." }, { status: 409 });
    throw error;
  }
}
