import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { aiAcceptSchema, aiNote, ensureAiCheckpoint, finishAiAccept } from "@/lib/server/course-editor/ai";
import { saveQuestion } from "@/lib/server/course-editor/service";
import { questionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

const putSchema = z.object({ snapshot: questionSnapshotSchema, baseFingerprint: z.string().min(1).max(64), note: z.string().trim().max(300).optional(), ai: aiAcceptSchema.optional() });

/** Frage samt Optionen speichern (Optionen behalten ihre IDs); der alte Stand wird zur Revision. */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string; questionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = putSchema.parse(await request.json());
    if (!body.ai) {
      const result = await saveQuestion(certId, ids.questionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "manual", note: body.note || null });
      if (result.changed) await audit("course.question_edited", "question", ids.questionId);
      return NextResponse.json(result);
    }
    // Übernommener KI-Vorschlag (wie bei Lektionen).
    const { name } = await ensureAiCheckpoint(certId, user.id);
    const result = await saveQuestion(certId, ids.questionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "ai", note: aiNote(body.ai.action, body.note) });
    if (result.changed) await audit("course.question_edited", "question", ids.questionId, { origin: "ai", action: body.ai.action });
    const after = await finishAiAccept(certId, { questions: [ids.questionId] }, { userId: user.id, resolveReports: body.ai.resolveReports, checkpoint: name });
    return NextResponse.json({ ...result, ...after });
  });
}
