import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { restoreCheckpoint } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

/** Ganzen Kurs auf einen gemerkten Stand zurücksetzen; jede geänderte Lektion/Frage bekommt vorher eine Revision. */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string; checkpointId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const result = await restoreCheckpoint(certId, ids.checkpointId, user.id);
    await audit("course.checkpoint_restored", "course_checkpoint", ids.checkpointId, result);
    return NextResponse.json(result);
  });
}
