import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyApi } from "@/lib/server/company/guard";
import {
  AlreadyAnsweredError,
  answerMentorRequest,
  InvalidMentorRequestError,
  MAX_ANSWER,
  MentorRequestNotFoundError,
  SelfAnswerError,
} from "@/lib/server/company/mentor-requests";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ note: z.string().max(MAX_ANSWER + 100).nullable().optional() });

/** Mentor (Empfänger) oder Firmen-Admin markiert eine Anfrage als beantwortet. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin", "mentor"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await request.text();
    body = bodySchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  try {
    await answerMentorRequest({ organizationId: guard.membership.organizationId, requestId: id, userId: guard.membership.userId, role: guard.membership.role, note: body.note });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MentorRequestNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof AlreadyAnsweredError) return NextResponse.json({ error: "Diese Anfrage ist schon beantwortet." }, { status: 409 });
    if (error instanceof SelfAnswerError) return NextResponse.json({ error: "Eigene Anfragen beantwortet jemand anderes." }, { status: 403 });
    if (error instanceof InvalidMentorRequestError) return NextResponse.json({ error: `Die Antwort darf höchstens ${MAX_ANSWER} Zeichen haben.` }, { status: 400 });
    throw error;
  }
}
