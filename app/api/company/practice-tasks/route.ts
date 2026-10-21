import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { checkPracticeTaskRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  createPracticeTask,
  InvalidTaskError,
  listPracticeTasksForOrg,
  MAX_TASK_DESCRIPTION,
  MAX_TASK_TITLE,
  UnknownObjectiveError,
  UnknownPathError,
} from "@/lib/server/company/practice-tasks";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  certificationId: z.string().uuid(),
  objectiveId: z.string().uuid().nullable().optional(),
  title: z.string().max(MAX_TASK_TITLE + 100),
  description: z.string().max(MAX_TASK_DESCRIPTION + 100).nullable().optional(),
});

/** Verwaltung (Mentor, Firmen-Admin): Aufgaben mit Zählern und Abgaben, die auf Bestätigung warten. */
export async function GET() {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const data = await listPracticeTasksForOrg(guard.membership.organizationId);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

/** Legt eine Praxisaufgabe zu einem Lernpfad der eigenen Firma an. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const limit = checkPracticeTaskRateLimit(guard.membership.userId);
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
    const created = await createPracticeTask({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, ...body });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidTaskError) {
      return NextResponse.json({ error: `Titel mindestens 3 und höchstens ${MAX_TASK_TITLE} Zeichen, Beschreibung höchstens ${MAX_TASK_DESCRIPTION}.` }, { status: 400 });
    }
    if (error instanceof UnknownPathError) return NextResponse.json({ error: "Lernpfad nicht gefunden." }, { status: 404 });
    if (error instanceof UnknownObjectiveError) return NextResponse.json({ error: "Lernziel gehört nicht zu diesem Lernpfad." }, { status: 400 });
    throw error;
  }
}
