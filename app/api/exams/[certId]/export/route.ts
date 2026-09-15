import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { listExamAttempts } from "@/lib/server/exam/history";
import { getActivityTrends } from "@/lib/server/analytics/learner-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/exams/:certId/export - R3 (roadmap.md): "Datenexport als JSON
 * oder CSV optional vorsehen" - JSON gewählt, da die Struktur (Versuche +
 * Trend-Fenster) nicht flach genug für eine sinnvolle CSV-Zeile pro Eintrag
 * ist, ohne Informationen zu verlieren. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const [attempts, trends] = await Promise.all([
    listExamAttempts(session.user.id, certId),
    getActivityTrends(session.user.id, certId),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    certificationId: certId,
    examAttempts: attempts,
    activityTrends: trends,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="exam-history-${certId}.json"`,
    },
  });
}
