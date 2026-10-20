import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { createQuestion, getObjectiveQuestions } from "@/lib/server/course-editor/service";
import { newQuestionSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids }) => NextResponse.json({ questions: await getObjectiveQuestions(certId, ids.objectiveId) }));
}

/** Neue Frage zum Lernziel. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, audit }) => {
    const body = z.object({ question: newQuestionSchema }).parse(await request.json());
    const result = await createQuestion(certId, ids.objectiveId, body.question);
    await audit("course.question_created", "question", result.questionId);
    return NextResponse.json(result, { status: 201 });
  });
}
