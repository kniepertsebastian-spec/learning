import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkAssignmentRateLimit } from "@/lib/server/auth-rate-limit";
import { InvalidDueDateError, MAX_ASSIGNEES, NotAMemberError, parseDueDate, UnknownLearningPathError } from "@/lib/server/company/assignments";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { assignCourseGroup, GroupNotFoundError, UnknownCourseError } from "@/lib/server/company/course-groups";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(MAX_ASSIGNEES), dueAt: z.string().nullable().optional() });

/** Kursgruppe Personen der eigenen Firma zuweisen: je Person und Kurs eine normale Zuweisung mit gemeinsamer Frist. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const limit = checkAssignmentRateLimit(guard.membership.userId);
  if (!limit.allowed) return NextResponse.json({ error: "Zu viele Zuweisungen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: z.infer<typeof bodySchema>;
  let dueAt: Date | null;
  try {
    body = bodySchema.parse(await request.json());
    dueAt = parseDueDate(body.dueAt);
  } catch (error) {
    if (error instanceof InvalidDueDateError) return NextResponse.json({ error: "Ungültige Frist (Format JJJJ-MM-TT, nicht in der Vergangenheit)." }, { status: 400 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
  try {
    const result = await assignCourseGroup({ organizationId: guard.membership.organizationId, assignedByUserId: guard.membership.userId, groupId: id, userIds: body.userIds, dueAt });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GroupNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof UnknownCourseError || error instanceof UnknownLearningPathError) return NextResponse.json({ error: "Mindestens ein Kurs der Gruppe ist nicht mehr verfügbar." }, { status: 409 });
    if (error instanceof NotAMemberError) return NextResponse.json({ error: "Mindestens eine Person gehört nicht zu deiner Organisation." }, { status: 400 });
    throw error;
  }
}
