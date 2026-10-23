import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkOnboardingRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { listAssignableLearningPaths } from "@/lib/server/company/assignments";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { createMandatoryRule, InvalidRuleError, listMandatoryRules, RepeatNotConfirmedError, RuleExistsError, UnknownCourseError, UnknownDepartmentError } from "@/lib/server/company/mandatory";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  certificationId: z.string().uuid(),
  roles: z.array(z.enum(["company_admin", "mentor", "learner"])).min(1).max(3),
  dueInDays: z.number().int(),
  reminderDaysBefore: z.number().int().optional(),
  escalateAfterDays: z.number().int().optional(),
  departmentIds: z.array(z.string().uuid()).max(50).optional(),
  repeatEveryMonths: z.number().int().nullable().optional(),
  confirmRepeatReset: z.boolean().optional(),
  applyOnChange: z.boolean().optional(),
  allowPlacementSkip: z.boolean().optional(),
});

/** Pflichtregeln der eigenen Firma mit Stand, dazu die zuweisbaren Lernpfade. */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const orgId = guard.membership.organizationId;
  const [rules, paths] = await Promise.all([listMandatoryRules(orgId), listAssignableLearningPaths(orgId)]);
  return NextResponse.json({ rules, paths }, { headers: { "Cache-Control": "no-store" } });
}

/** Legt eine Pflichtregel an (nur Firmen-Admin) und weist sofort allen vorhandenen Mitgliedern der Rollen zu. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const limit = checkOnboardingRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const created = await createMandatoryRule({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, ...body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidRuleError) {
      return NextResponse.json({ error: "Frist 1 bis 365 Tage, Erinnerung 0 bis 60 Tage vorher, Eskalation 1 bis 60 Tage nach der Frist, Wiederholung 1 bis 60 Monate." }, { status: 400 });
    }
    if (error instanceof RepeatNotConfirmedError) {
      return NextResponse.json({ error: "Bitte bestätige, dass bei jeder Wiederholung der Status zurückgesetzt wird.", code: "confirm_repeat_reset" }, { status: 400 });
    }
    if (error instanceof UnknownDepartmentError) return NextResponse.json({ error: "Abteilung nicht gefunden." }, { status: 404 });
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Lernpfad nicht gefunden." }, { status: 404 });
    if (error instanceof RuleExistsError) return NextResponse.json({ error: "Für diesen Lernpfad gibt es schon eine Pflichtregel." }, { status: 409 });
    throw error;
  }
}
