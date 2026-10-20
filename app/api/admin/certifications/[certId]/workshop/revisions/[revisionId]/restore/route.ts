import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { restoreRevision } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

/** Auf den Stand einer Revision zurücksetzen; der aktuelle Stand bleibt als Revision erhalten. */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string; revisionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const result = await restoreRevision(certId, ids.revisionId, user.id);
    await audit("course.revision_restored", "content_revision", ids.revisionId, { result });
    return NextResponse.json({ result });
  });
}
