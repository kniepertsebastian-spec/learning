import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPracticeTaskRateLimit } from "@/lib/server/auth-rate-limit";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  InvalidTaskError,
  MAX_NOTE,
  NotReviewableError,
  reviewPracticeSubmission,
  ReviewNoteRequiredError,
  SelfReviewError,
} from "@/lib/server/company/practice-tasks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ decision: z.enum(["confirm", "rework"]), note: z.string().max(MAX_NOTE + 100).nullable().optional() });

/** Mentor oder Firmen-Admin bestätigt eine Abgabe oder schickt sie mit Hinweis zur Nacharbeit zurück. Nie die eigene. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = checkPracticeTaskRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Aktionen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  try {
    const ok = await reviewPracticeSubmission({
      organizationId: guard.membership.organizationId,
      reviewerId: guard.membership.userId,
      submissionId: id,
      decision: body.decision,
      note: body.note,
    });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof SelfReviewError) return NextResponse.json({ error: "Die eigene Abgabe bestätigt eine andere Person." }, { status: 403 });
    if (error instanceof NotReviewableError) return NextResponse.json({ error: "Diese Abgabe wartet nicht auf eine Prüfung." }, { status: 409 });
    if (error instanceof ReviewNoteRequiredError) return NextResponse.json({ error: "Für die Nacharbeit bitte einen Hinweis schreiben (mindestens 3 Zeichen)." }, { status: 400 });
    if (error instanceof InvalidTaskError) return NextResponse.json({ error: `Der Hinweis darf höchstens ${MAX_NOTE} Zeichen haben.` }, { status: 400 });
    throw error;
  }
}
