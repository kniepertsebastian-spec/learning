import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPracticeTaskRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { AlreadyConfirmedError, InvalidTaskError, MAX_NOTE, submitPracticeTask, TaskNotFoundError } from "@/lib/server/company/practice-tasks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ note: z.string().max(MAX_NOTE + 100).nullable().optional() });

/** Gibt eine Praxisaufgabe ab (alle Rollen, aber nur zu Lernpfaden, die mir zugewiesen sind). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor", "learner"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkPracticeTaskRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const raw = await request.text();
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  try {
    await submitPracticeTask({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, taskId: id, note: body.note });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TaskNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof AlreadyConfirmedError) return NextResponse.json({ error: "Diese Aufgabe ist schon bestätigt." }, { status: 409 });
    if (error instanceof InvalidTaskError) return NextResponse.json({ error: `Die Notiz darf höchstens ${MAX_NOTE} Zeichen haben.` }, { status: 400 });
    throw error;
  }
}
