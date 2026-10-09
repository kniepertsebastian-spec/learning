import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { createCourseGroup, GroupError, listCourseGroups, UnknownCourseError } from "@/lib/server/company/course-groups";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { COURSE_CATEGORY_COLORS } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

const groupBodySchema = z.object({
  name: z.object({ de: z.string(), en: z.string() }),
  color: z.enum(COURSE_CATEGORY_COLORS),
  certificationIds: z.array(z.string().uuid()).min(1).max(30),
});

/** Kursgruppen der eigenen Firma (Firmen-Admin und Mentor – wie beim Zuweisen). */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ groups: await listCourseGroups(guard.membership.organizationId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  try {
    const body = groupBodySchema.parse(await request.json());
    const id = await createCourseGroup({ organizationId: guard.membership.organizationId, actorUserId: guard.membership.userId, ...body });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof UnknownCourseError) return NextResponse.json({ error: "Mindestens ein Kurs ist für deine Firma nicht verfügbar." }, { status: 404 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof GroupError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
