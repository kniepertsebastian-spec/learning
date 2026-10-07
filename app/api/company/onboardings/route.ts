import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { listAssignableLearningPaths } from "@/lib/server/company/assignments";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { listResponsibleCandidates } from "@/lib/server/company/modules";
import {
  createOnboardingPlan,
  InvalidPlanError,
  InvalidResponsibleError,
  listOnboardingPlans,
  MAX_PLAN_COURSES,
  MAX_PLAN_DESCRIPTION,
  MAX_PLAN_NAME,
  UnknownCourseError,
} from "@/lib/server/company/onboardings";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().max(MAX_PLAN_NAME + 100),
  description: z.string().max(MAX_PLAN_DESCRIPTION + 100).nullable().optional(),
  mentorUserId: z.string().uuid().nullable().optional(),
  certificationIds: z.array(z.string().uuid()).min(1).max(MAX_PLAN_COURSES),
});

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });

/** Pläne der eigenen Firma mit Stand je Person, dazu wählbare Lernpfade und Mentoren. */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const orgId = guard.membership.organizationId;
  const [plans, paths, mentors] = await Promise.all([listOnboardingPlans(orgId), listAssignableLearningPaths(orgId), listResponsibleCandidates(orgId)]);
  return NextResponse.json({ plans, paths, mentors }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) return tooMany(limit.retryAfterSeconds);
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const created = await createOnboardingPlan({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, ...body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidPlanError) {
      return NextResponse.json({ error: `Name mindestens 3 und höchstens ${MAX_PLAN_NAME} Zeichen, 1 bis ${MAX_PLAN_COURSES} Lernpfade.` }, { status: 400 });
    }
    if (error instanceof InvalidResponsibleError) return NextResponse.json({ error: "Mentor kann nur ein Mentor oder Firmen-Admin der Firma sein." }, { status: 400 });
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Mindestens ein Lernpfad ist nicht verfügbar." }, { status: 404 });
    throw error;
  }
}
