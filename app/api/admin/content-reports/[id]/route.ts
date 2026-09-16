import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { ContentReportNotFoundError, resolveContentReport } from "@/lib/server/content-reports/service";
import { recordAuditEvent } from "@/lib/server/audit/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resolveSchema = z.object({ status: z.enum(["resolved", "dismissed"]) });

/** POST /api/admin/content-reports/:id - R6 (roadmap.md): eine gemeldete
 * Frage als "erledigt" oder "verworfen" abschließen, verlässt damit die
 * offene Review-Queue. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { id } = await params;
  try {
    await resolveContentReport(id, guard.user.id, parsed.data.status);
    await recordAuditEvent({
      actorUserId: guard.user.id,
      action: "content_report.resolved",
      targetType: "content_report",
      targetId: id,
      metadata: { status: parsed.data.status },
    }).catch((error) => console.error("Audit-Log fehlgeschlagen:", error));
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (error instanceof ContentReportNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
