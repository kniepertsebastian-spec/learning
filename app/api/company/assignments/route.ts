import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkAssignmentRateLimit } from "@/lib/server/auth-rate-limit";
import {
  assignLearningPath,
  InvalidDueDateError,
  MAX_ASSIGNEES,
  NotAMemberError,
  parseDueDate,
  UnknownLearningPathError,
} from "@/lib/server/company/assignments";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const assignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(MAX_ASSIGNEES),
  certificationId: z.string().uuid(),
  dueAt: z.string().nullable().optional(),
});

/**
 * Weist einen Lernpfad Mitgliedern der EIGENEN Organisation zu (Firmen-Admin und Mentor). Die
 * Organisation kommt aus der Mitgliedschaft, nie aus dem Body. Die Statusübersicht liefert
 * GET /api/company/status.
 */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;

  const limit = checkAssignmentRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Zuweisungen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof assignSchema>;
  let dueAt: Date | null;
  try {
    body = assignSchema.parse(await request.json());
    dueAt = parseDueDate(body.dueAt);
  } catch (error) {
    if (error instanceof InvalidDueDateError) {
      return NextResponse.json({ error: "Ungültige Frist (Format JJJJ-MM-TT, nicht in der Vergangenheit)." }, { status: 400 });
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    throw error;
  }

  try {
    const result = await assignLearningPath({
      organizationId: guard.membership.organizationId,
      assignedByUserId: guard.membership.userId,
      userIds: body.userIds,
      certificationId: body.certificationId,
      dueAt,
    });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnknownLearningPathError) {
      return NextResponse.json({ error: "Lernpfad nicht gefunden." }, { status: 404 });
    }
    if (error instanceof NotAMemberError) {
      return NextResponse.json({ error: "Mindestens eine Person gehört nicht zu deiner Organisation." }, { status: 400 });
    }
    console.error("Error assigning learning path:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
