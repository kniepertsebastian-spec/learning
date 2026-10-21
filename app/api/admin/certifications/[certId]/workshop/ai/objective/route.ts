import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { createObjectiveWithContent, ensureAiCheckpoint, finishAiAccept, objectiveAcceptSchema } from "@/lib/server/course-editor/ai";
import { newQuestionSchema, sectionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

const schema = objectiveAcceptSchema.extend({ sections: z.array(sectionSnapshotSchema).min(1).max(6), questions: z.array(newQuestionSchema).max(20) });

/** Übernommener KI-Vorschlag „Fehlendes Lernziel ergänzen“: Lernziel, Lektionen und Fragen anlegen. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, user, audit }) => {
    const body = schema.parse(await request.json());
    const { name } = await ensureAiCheckpoint(certId, user.id);
    const created = await createObjectiveWithContent(certId, body);
    await audit("course.objective_created", "objective", created.objectiveId, { origin: "ai", code: body.code });
    const after = await finishAiAccept(certId, {}, { userId: user.id, checkpoint: name });
    return NextResponse.json({ ...created, ...after }, { status: 201 });
  });
}
