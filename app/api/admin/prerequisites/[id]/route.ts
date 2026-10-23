import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { PrerequisiteNotFoundError, reviewPrerequisite } from "@/lib/server/prerequisites/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ decision: z.enum(["approved", "rejected"]) });

/** POST /api/admin/prerequisites/:id - Voraussetzung freigeben oder verwerfen. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    await reviewPrerequisite({ id, reviewerUserId: guard.user.id, decision: parsed.data.decision });
    await recordAuditEvent({ actorUserId: guard.user.id, action: "prerequisite.reviewed", targetType: "concept_prerequisite", targetId: id, metadata: { decision: parsed.data.decision } }).catch((error) =>
      console.error("Audit-Log fehlgeschlagen:", error),
    );
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (error instanceof PrerequisiteNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
