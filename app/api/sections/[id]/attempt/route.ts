import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  sections,
  objectives,
  domains,
  questionOptions,
  quizzes,
  quizAttempts,
  quizAnswers,
} from "@/lib/server/db/schema";

interface AnswerPayload {
  questionId: string;
  selectedOptionId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sectionId } = await params;
  const body = (await request.json()) as { answers: AnswerPayload[] };
  const db = getDb();

  // Resolve certificationId via join: section → objective → domain
  const certInfo = await db
    .select({ certificationId: domains.certificationId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!certInfo.length) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  // Get or create quiz for this section
  const existingQuiz = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.sectionId, sectionId))
    .limit(1);

  let quizId: string;
  if (existingQuiz.length) {
    quizId = existingQuiz[0].id;
  } else {
    const inserted = await db
      .insert(quizzes)
      .values({ sectionId, certificationId: certInfo[0].certificationId })
      .returning();
    quizId = inserted[0].id;
  }

  // Create attempt
  const attemptInserted = await db
    .insert(quizAttempts)
    .values({
      quizId,
      userId: session.user.id,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning();
  const attemptId = attemptInserted[0].id;

  // Determine correctness per answer
  const questionIds = body.answers.map((a) => a.questionId);
  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
      : [];

  const results: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string }> = [];
  let correctCount = 0;

  for (const answer of body.answers) {
    const correctOption = optionRows.find((o) => o.questionId === answer.questionId && o.isCorrect);
    const isCorrect = !!correctOption && correctOption.id === answer.selectedOptionId;
    if (isCorrect) correctCount++;
    results.push({
      questionId: answer.questionId,
      isCorrect,
      correctOptionId: correctOption?.id ?? "",
    });
  }

  // Save answers
  if (body.answers.length > 0) {
    await db.insert(quizAnswers).values(
      body.answers.map((a) => ({
        quizAttemptId: attemptId,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId || null,
        isCorrect: results.find((r) => r.questionId === a.questionId)?.isCorrect ?? false,
      })),
    );
  }

  const score =
    body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

  await db
    .update(quizAttempts)
    .set({ score: String(score) })
    .where(eq(quizAttempts.id, attemptId));

  return NextResponse.json({ score, results, attemptId });
}
