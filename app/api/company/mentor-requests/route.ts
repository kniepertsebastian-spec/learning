import { NextResponse } from "next/server";
import { z } from "zod";
import { checkMentorRequestRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { createMentorRequest, InvalidMentorRequestError, MAX_MESSAGE, MAX_TOPIC, MIN_MESSAGE, NoMentorError } from "@/lib/server/company/mentor-requests";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  topic: z.string().max(MAX_TOPIC + 100),
  message: z.string().max(MAX_MESSAGE + 100),
  certificationId: z.string().uuid().nullable().optional(),
});

/** Der Lernende bittet seinen Mentor um Hilfe. Gesendet wird nur der Text, den die Person selbst geprüft hat. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(["company_admin", "mentor", "learner"]);
  if (!guard.ok) return guard.response;
  const limit = checkMentorRequestRateLimit(guard.membership.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  try {
    const created = await createMentorRequest({ organizationId: guard.membership.organizationId, userId: guard.membership.userId, certificationId: body.certificationId, topic: body.topic, message: body.message });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidMentorRequestError) {
      return NextResponse.json({ error: `Bitte beschreibe kurz, wo es hängt (${MIN_MESSAGE} bis ${MAX_MESSAGE} Zeichen).` }, { status: 400 });
    }
    if (error instanceof NoMentorError) return NextResponse.json({ error: "Dir ist noch kein Mentor zugeordnet." }, { status: 409 });
    throw error;
  }
}
