import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { createFrameworkGoal, InvalidGoalError, listFrameworkGoalsForOrg, MAX_GOAL_CODE, MAX_GOAL_TITLE, UnknownObjectiveError } from "@/lib/server/company/framework-goals";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  objectiveId: z.string().uuid(),
  code: z.string().max(MAX_GOAL_CODE + 20).nullable().optional(),
  title: z.string().max(MAX_GOAL_TITLE + 100),
});

export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  return NextResponse.json(await listFrameworkGoalsForOrg(guard.membership.organizationId), { headers: { "Cache-Control": "no-store" } });
}

/** Ordnet einem Lernziel einen Eintrag des Ausbildungsrahmenplans der Firma zu. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    return NextResponse.json(await createFrameworkGoal({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, ...body }), { status: 201 });
  } catch (error) {
    if (error instanceof InvalidGoalError) return NextResponse.json({ error: `Titel mindestens 3 und höchstens ${MAX_GOAL_TITLE} Zeichen.` }, { status: 400 });
    if (error instanceof UnknownObjectiveError) return NextResponse.json({ error: "Lernziel nicht gefunden." }, { status: 404 });
    throw error;
  }
}
