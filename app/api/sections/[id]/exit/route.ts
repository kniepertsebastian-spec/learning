import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { isSectionHidden } from "@/lib/server/catalog/access";
import { exitSectionQuiz } from "@/lib/server/exit/service";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { recordSectionQuizAttempt, type SectionQuizAnswerInput } from "@/lib/server/sections/attempt-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/sections/:id/exit - Notausstieg „Heute reicht's“ im Lektionstest: beantwortete Fragen werden gewertet, die offene nicht. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!isFeatureEnabled("exit_with_win", userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id: sectionId } = await params;
  if (await isSectionHidden(userId, sectionId)) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  const body = (await request.json()) as { answers?: SectionQuizAnswerInput[]; openQuestionId?: string };
  const answered = (body.answers ?? []).filter((a) => a.selectedOptionId || a.answer);
  const result = await exitSectionQuiz(userId, sectionId, body.openQuestionId ?? null, () => (answered.length > 0 ? recordSectionQuizAttempt(userId, sectionId, answered) : Promise.resolve()));
  if (!result) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  return NextResponse.json(result);
}
