import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { saveQuestion } from "@/lib/server/course-editor/service";
import { questionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

const putSchema = z.object({ snapshot: questionSnapshotSchema, baseFingerprint: z.string().min(1).max(64), note: z.string().trim().max(300).optional() });

/** Frage samt Optionen speichern (Optionen behalten ihre IDs); der alte Stand wird zur Revision. */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string; questionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = putSchema.parse(await request.json());
    const result = await saveQuestion(certId, ids.questionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "manual", note: body.note || null });
    if (result.changed) await audit("course.question_edited", "question", ids.questionId);
    return NextResponse.json(result);
  });
}
