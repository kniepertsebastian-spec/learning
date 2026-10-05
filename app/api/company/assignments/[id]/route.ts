import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { InvalidDueDateError, parseDueDate, removeAssignment, updateAssignmentDueDate } from "@/lib/server/company/assignments";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ dueAt: z.string().nullable() });

type Ctx = { params: Promise<{ id: string }> };

async function validId(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  return z.string().uuid().safeParse(id).success ? id : null;
}

/** Ändert die Frist (oder entfernt sie mit null) einer offenen Zuweisung der eigenen Organisation. */
export async function PATCH(request: Request, ctx: Ctx) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const id = await validId(ctx);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let dueAt: Date | null;
  try {
    dueAt = parseDueDate(patchSchema.parse(await request.json()).dueAt);
  } catch (error) {
    if (error instanceof InvalidDueDateError) {
      return NextResponse.json({ error: "Ungültige Frist (Format JJJJ-MM-TT, nicht in der Vergangenheit)." }, { status: 400 });
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    throw error;
  }

  const ok = await updateAssignmentDueDate(guard.membership.organizationId, id, dueAt, guard.membership.userId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

/** Entfernt eine offene Zuweisung der eigenen Organisation. Abgeschlossene bleiben bestehen (404). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const id = await validId(ctx);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await removeAssignment(guard.membership.organizationId, id, guard.membership.userId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
