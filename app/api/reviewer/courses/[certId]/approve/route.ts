import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ApprovalInvalidError, approveCourse } from "@/lib/server/approvals/service";
import { requireReviewerApi } from "@/lib/server/reviewers/guard";
import { assertQualified, NotQualifiedError } from "@/lib/server/reviewers/probe-service";

export const dynamic = "force-dynamic";

const schema = z.object({ displayName: z.string().max(120), confirmed: z.boolean(), note: z.string().max(500).nullable().optional() });

/** Prüfer: Freigabe des zugewiesenen Kurses für den aktuellen Inhaltsstand („Ich habe die Inhalte dieser Version fachlich geprüft“). */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await requireReviewerApi(certId);
  if (!guard.ok) return guard.response;
  try {
    await assertQualified(guard.user.id);
    const body = schema.parse(await request.json());
    const entry = await approveCourse({ certificationId: certId, reviewer: { userId: guard.user.id, displayName: body.displayName }, confirmed: body.confirmed, recordedByUserId: guard.user.id, note: body.note });
    return NextResponse.json({ versionLabel: entry.versionLabel }, { status: 201 });
  } catch (error) {
    if (error instanceof NotQualifiedError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof ApprovalInvalidError) return NextResponse.json({ error: "Für die Freigabe braucht es deinen Namen und die Bestätigung, dass du die Inhalte dieser Version fachlich geprüft hast." }, { status: 400 });
    throw error;
  }
}
