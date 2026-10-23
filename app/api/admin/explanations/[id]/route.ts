import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { ExplanationNotFoundError, InvalidExplanationError, reviewExplanation } from "@/lib/server/explanations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  content: z.object({ de: z.string().max(2500), en: z.string().max(2500) }).optional(),
  solution: z.object({ de: z.string().max(1500), en: z.string().max(1500) }).optional(),
});

/** POST /api/admin/explanations/:id - Entwurf freigeben oder verwerfen, optional mit überarbeitetem Text. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    await reviewExplanation({ id, reviewerUserId: guard.user.id, decision: parsed.data.decision, content: parsed.data.content, solution: parsed.data.solution });
    await recordAuditEvent({
      actorUserId: guard.user.id,
      action: "explanation.reviewed",
      targetType: "objective_explanation",
      targetId: id,
      metadata: { decision: parsed.data.decision, edited: Boolean(parsed.data.content || parsed.data.solution) },
    }).catch((error) => console.error("Audit-Log fehlgeschlagen:", error));
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (error instanceof ExplanationNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof InvalidExplanationError) return NextResponse.json({ error: "Beide Sprachen brauchen einen Text." }, { status: 400 });
    throw error;
  }
}
