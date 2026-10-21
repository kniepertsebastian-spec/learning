import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { ensureAiCheckpoint, finishAiAccept } from "@/lib/server/course-editor/ai";
import { createQuestion, getObjectiveQuestions } from "@/lib/server/course-editor/service";
import { newQuestionSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids }) => NextResponse.json({ questions: await getObjectiveQuestions(certId, ids.objectiveId) }));
}

const postSchema = z.union([z.object({ question: newQuestionSchema }), z.object({ questions: z.array(newQuestionSchema).min(1).max(20), ai: z.literal(true) })]);

/** Neue Frage zum Lernziel, oder mehrere aus einem übernommenen KI-Vorschlag „Fragen ergänzen“. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = postSchema.parse(await request.json());
    if ("question" in body) {
      const result = await createQuestion(certId, ids.objectiveId, body.question);
      await audit("course.question_created", "question", result.questionId);
      return NextResponse.json(result, { status: 201 });
    }
    const { name } = await ensureAiCheckpoint(certId, user.id);
    const created = [];
    for (const q of body.questions) {
      const result = await createQuestion(certId, ids.objectiveId, q);
      await audit("course.question_created", "question", result.questionId, { origin: "ai" });
      created.push(result);
    }
    const after = await finishAiAccept(certId, { questions: created.map((c) => c.questionId) }, { userId: user.id, checkpoint: name });
    return NextResponse.json({ created, ...after }, { status: 201 });
  });
}
