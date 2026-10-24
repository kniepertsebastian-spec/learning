import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { errorType, probeErrorResponse, uuid } from "@/lib/server/reviewers/probe-http";
import { getAttemptView, setReport } from "@/lib/server/reviewers/probe-service";

export const dynamic = "force-dynamic";

const schema = z.object({ itemId: z.string().uuid(), report: z.object({ type: errorType, text: z.string().max(1000) }).nullable() });

/** Prüfer: Frage als fehlerhaft melden (mit Art und Begründung) oder die Meldung zurücknehmen. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = schema.parse(await request.json());
    await setReport(guard.user.id, id, body.itemId, body.report as never);
    return NextResponse.json({ reports: (await getAttemptView(guard.user.id, id))?.reports ?? [] });
  } catch (error) {
    return probeErrorResponse(error);
  }
}
