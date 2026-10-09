import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { deleteCourseGroup, GroupError, GroupNotFoundError, UnknownCourseError, updateCourseGroup } from "@/lib/server/company/course-groups";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { COURSE_CATEGORY_COLORS } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.object({ de: z.string(), en: z.string() }),
  color: z.enum(COURSE_CATEGORY_COLORS),
  certificationIds: z.array(z.string().uuid()).min(1).max(30),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = bodySchema.parse(await request.json());
    await updateCourseGroup({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, groupId: id, ...body });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof GroupNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Mindestens ein Kurs ist für deine Firma nicht verfügbar." }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof GroupError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteCourseGroup({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, groupId: id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof GroupNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
