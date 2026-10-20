import { isCertificationHidden, isExamHidden } from "@/lib/server/catalog/access";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  exams,
  examAnswers,
  examAttempts,
  questionOptions,
  questions,
} from "@/lib/server/db/schema";
import { ExamScoringService } from "@/lib/server/exam/scoring";
import { getServerLocale } from "@/lib/server/locale";
import { recordReviewOutcomes } from "@/lib/server/review/service";
import { passMarkPercent, recordFinalExamPass } from "@/lib/server/stats/completions";
import { addSkillFromCourse } from "@/lib/server/profile/service";

interface ExamAnswerPayload {
  answers: Array<{ questionId: string; selectedOptionId: string }>;
  /** R3 (roadmap.md): "Seite 'Meine Prüfungen' mit ... Dauer" - vom Client
   * gemessen (Zeit von Sessionstart bis Einreichen), optional, damit alte
   * Client-Versionen weiterhin funktionieren. */
  durationSeconds?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string; examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId, examId } = await params;
  if ((await isCertificationHidden(session.user.id, certId)) || (await isExamHidden(session.user.id, examId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await request.json()) as ExamAnswerPayload;
  const db = getDb();
  const locale = await getServerLocale();

  try {
    // Verify exam exists
    const examRecord = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);

    if (!examRecord.length) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Evaluate answers
    const questionIds = body.answers.map((a) => a.questionId);
    const optionRows =
      questionIds.length > 0
        ? await db
            .select()
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, questionIds))
        : [];

    let correctCount = 0;
    const results: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string }> = [];
    const answerEvaluation: Array<{ questionId: string; isCorrect: boolean }> = [];

    for (const answer of body.answers) {
      const correctOption = optionRows.find(
        (o) => o.questionId === answer.questionId && o.isCorrect,
      );
      const isCorrect = !!correctOption && correctOption.id === answer.selectedOptionId;
      if (isCorrect) correctCount++;
      results.push({
        questionId: answer.questionId,
        isCorrect,
        correctOptionId: correctOption?.id ?? "",
      });
      answerEvaluation.push({
        questionId: answer.questionId,
        isCorrect,
      });
    }

    const score =
      body.answers.length > 0 ? Math.round((correctCount / body.answers.length) * 100) : 0;

    // Use detailed scoring service for comprehensive analysis
    const scoringResult = await ExamScoringService.scoreExam(
      session.user.id,
      examId,
      answerEvaluation,
      locale,
    );

    // Bestanden: Punkte erreichen die Bestehensgrenze des Kurses (offizielle Prozentgrenze, sonst 70 %).
    const [cert] = await db.select({ passingScore: certifications.passingScore }).from(certifications).where(eq(certifications.id, examRecord[0].certificationId)).limit(1);
    const passed = body.answers.length > 0 && score >= passMarkPercent(cert?.passingScore);

    // Create exam attempt with readiness
    const attemptInserted = await db
      .insert(examAttempts)
      .values({
        examId,
        userId: session.user.id,
        score: String(score),
        passed,
        readiness: scoringResult.readinessLevel,
        completedAt: new Date(),
        durationSeconds:
          typeof body.durationSeconds === "number" && body.durationSeconds >= 0
            ? Math.round(body.durationSeconds)
            : null,
      })
      .returning();

    // R3: einzelne Antworten persistieren - sonst lässt sich eine
    // Domain-/Objective-Auswertung für diesen Versuch später nicht mehr
    // rekonstruieren (siehe Kommentar auf exam_answers in db/schema.ts).
    if (results.length > 0) {
      await db.insert(examAnswers).values(
        results.map((r) => ({
          examAttemptId: attemptInserted[0].id,
          questionId: r.questionId,
          selectedOptionId: body.answers.find((a) => a.questionId === r.questionId)?.selectedOptionId || null,
          isCorrect: r.isCorrect,
        })),
      );
    }

    // Anonyme Abschluss-Statistik: erstes Bestehen der Person in diesem Kurs (lib/server/stats/completions.ts).
    if (passed) await recordFinalExamPass(session.user.id, examRecord[0].certificationId, attemptInserted[0].id);
    // Skill aus dem Kurs ins Profil, wenn die Person das erlaubt hat (lib/server/profile/service.ts).
    if (passed) await addSkillFromCourse(session.user.id, examRecord[0].certificationId, "course");

    // R2.2: Review-Zustand (Fälligkeit/Intervall) je beantworteter Frage fortschreiben.
    await recordReviewOutcomes(session.user.id, answerEvaluation);

    return NextResponse.json({
      attemptId: attemptInserted[0].id,
      score,
      readiness: scoringResult.readinessLevel,
      readinessLabel: scoringResult.readinessLabel,
      readinessConfidence: scoringResult.readinessConfidence,
      results,
      analysis: {
        domainPerformance: scoringResult.domainPerformance,
        weakObjectives: scoringResult.weakObjectives,
        recommendations: scoringResult.recommendations,
        comparison: scoringResult.comparison,
      },
    });
  } catch (error) {
    console.error("Error submitting exam:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
