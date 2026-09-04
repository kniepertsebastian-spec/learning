import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  lessons,
  questions,
  questionOptions,
  sections,
  objectives,
  domains,
  certificationSources,
  objectiveSourceRefs,
} from "@/lib/server/db/schema";

export interface ValidationIssue {
  type:
    | "empty_content"
    | "short_content"
    | "no_options"
    | "wrong_option_count"
    | "no_correct_answer"
    | "multiple_correct_answers"
    | "missing_explanation"
    | "potential_duplicate";
  severity: "error" | "warning" | "info";
  message: string;
  contentId: string;
}

export interface ValidationResult {
  contentId: string;
  contentType: "lesson" | "question";
  isValid: boolean;
  issues: ValidationIssue[];
}

export class ContentValidationService {
  /**
   * Validates a lesson for content quality
   */
  static async validateLesson(lessonId: string): Promise<ValidationResult> {
    const db = getDb();
    const lesson = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);

    const issues: ValidationIssue[] = [];

    if (!lesson.length) {
      return {
        contentId: lessonId,
        contentType: "lesson",
        isValid: false,
        issues: [
          {
            type: "empty_content",
            severity: "error",
            message: "Lesson not found",
            contentId: lessonId,
          },
        ],
      };
    }

    const lessonRecord = lesson[0];

    // Check content
    if (!lessonRecord.content) {
      issues.push({
        type: "empty_content",
        severity: "error",
        message: "Lesson content is empty",
        contentId: lessonId,
      });
    } else {
      const contentStr = JSON.stringify(lessonRecord.content);
      if (contentStr.length < 100) {
        issues.push({
          type: "short_content",
          severity: "warning",
          message: "Lesson content is very short (< 100 chars)",
          contentId: lessonId,
        });
      }
    }

    // Check key takeaways
    if (!lessonRecord.keyTakeaways) {
      issues.push({
        type: "missing_explanation",
        severity: "warning",
        message: "Lesson missing key takeaways",
        contentId: lessonId,
      });
    }

    return {
      contentId: lessonId,
      contentType: "lesson",
      isValid: issues.filter((i) => i.severity === "error").length === 0,
      issues,
    };
  }

  /**
   * Validates a question for correctness
   */
  static async validateQuestion(questionId: string): Promise<ValidationResult> {
    const db = getDb();
    const question = await db
      .select()
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    const issues: ValidationIssue[] = [];

    if (!question.length) {
      return {
        contentId: questionId,
        contentType: "question",
        isValid: false,
        issues: [
          {
            type: "empty_content",
            severity: "error",
            message: "Question not found",
            contentId: questionId,
          },
        ],
      };
    }

    const questionRecord = question[0];

    // Check options
    const options = await db
      .select()
      .from(questionOptions)
      .where(eq(questionOptions.questionId, questionId));

    if (options.length === 0) {
      issues.push({
        type: "no_options",
        severity: "error",
        message: "Question has no answer options",
        contentId: questionId,
      });
    } else if (options.length !== 4) {
      issues.push({
        type: "wrong_option_count",
        severity: "error",
        message: `Question has ${options.length} options, expected 4`,
        contentId: questionId,
      });
    }

    // Check correct answers
    const correctOptions = options.filter((o) => o.isCorrect);
    if (correctOptions.length === 0) {
      issues.push({
        type: "no_correct_answer",
        severity: "error",
        message: "Question has no correct answer",
        contentId: questionId,
      });
    } else if (correctOptions.length > 1) {
      issues.push({
        type: "multiple_correct_answers",
        severity: "error",
        message: `Question has ${correctOptions.length} correct answers, expected 1`,
        contentId: questionId,
      });
    }

    // Check explanation
    if (!questionRecord.explanation) {
      issues.push({
        type: "missing_explanation",
        severity: "warning",
        message: "Question missing explanation",
        contentId: questionId,
      });
    }

    // Check question text
    if (!questionRecord.question) {
      issues.push({
        type: "empty_content",
        severity: "error",
        message: "Question text is empty",
        contentId: questionId,
      });
    }

    return {
      contentId: questionId,
      contentType: "question",
      isValid: issues.filter((i) => i.severity === "error").length === 0,
      issues,
    };
  }

  /**
   * R1.5 (roadmap.md): Anzahl Lessons/Fragen, die durch eine neue
   * Quellenversion als veraltet markiert wurden ("Betroffene Lessons und
   * Fragen als stale markieren") - damit ein Admin sieht, wie viel gezielte
   * Neugenerierung noch aussteht (npm run content:draft-lessons regeneriert
   * nur genau diese, siehe scripts/generate-lessons-and-questions.ts).
   */
  static async getStaleContentCounts(
    certificationId: string,
  ): Promise<{ staleLessons: number; staleQuestions: number }> {
    const db = getDb();
    const certObjectiveIds = (
      await db
        .select({ id: objectives.id })
        .from(objectives)
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .where(eq(domains.certificationId, certificationId))
    ).map((o) => o.id);
    if (certObjectiveIds.length === 0) return { staleLessons: 0, staleQuestions: 0 };

    const certSectionIds = (
      await db
        .select({ id: sections.id })
        .from(sections)
        .where(inArray(sections.objectiveId, certObjectiveIds))
    ).map((s) => s.id);

    const [staleLessonRows, staleQuestionRows] = await Promise.all([
      certSectionIds.length > 0
        ? db
            .select({ id: lessons.id })
            .from(lessons)
            .where(and(inArray(lessons.sectionId, certSectionIds), eq(lessons.reviewStatus, "stale")))
        : Promise.resolve([]),
      db
        .select({ id: questions.id })
        .from(questions)
        .where(and(inArray(questions.objectiveId, certObjectiveIds), eq(questions.stale, true))),
    ]);

    return { staleLessons: staleLessonRows.length, staleQuestions: staleQuestionRows.length };
  }

  /**
   * R1.4 (roadmap.md): "Quellenabdeckung validieren: Jedes Objective benötigt
   * mindestens eine Referenz" - aber nur relevant, sobald die Zertifizierung
   * überhaupt eine freigegebene Quelle hat (approved). Ohne freigegebene
   * Quelle bleibt der bisherige rein KI-generierte Weg (roadmap2.md)
   * unverändert gültig und wird nicht als "fehlende Abdeckung" gemeldet.
   */
  static async validateSourceCoverage(certificationId: string): Promise<{
    hasApprovedSource: boolean;
    objectivesWithoutReference: { id: string; code: string; title: string }[];
  }> {
    const db = getDb();
    const [approvedSource] = await db
      .select({ id: certificationSources.id })
      .from(certificationSources)
      .where(
        and(
          eq(certificationSources.certificationId, certificationId),
          eq(certificationSources.status, "approved"),
        ),
      )
      .limit(1);
    if (!approvedSource) {
      return { hasApprovedSource: false, objectivesWithoutReference: [] };
    }

    const certObjectives = await db
      .select({ id: objectives.id, code: objectives.code, title: objectives.title })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certificationId));
    if (certObjectives.length === 0) {
      return { hasApprovedSource: true, objectivesWithoutReference: [] };
    }

    const refs = await db
      .select({ objectiveId: objectiveSourceRefs.objectiveId })
      .from(objectiveSourceRefs)
      .where(
        inArray(
          objectiveSourceRefs.objectiveId,
          certObjectives.map((o) => o.id),
        ),
      );
    const objectiveIdsWithRef = new Set(refs.map((r) => r.objectiveId));

    return {
      hasApprovedSource: true,
      objectivesWithoutReference: certObjectives.filter((o) => !objectiveIdsWithRef.has(o.id)),
    };
  }

  /**
   * Validates all content for a certification
   */
  static async validateCertificationContent(certificationId: string) {
    const db = getDb();

    const certObjectiveIds = (
      await db
        .select({ id: objectives.id })
        .from(objectives)
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .where(eq(domains.certificationId, certificationId))
    ).map((o) => o.id);

    const certSectionIds =
      certObjectiveIds.length > 0
        ? (
            await db
              .select({ id: sections.id })
              .from(sections)
              .where(inArray(sections.objectiveId, certObjectiveIds))
          ).map((s) => s.id)
        : [];

    const allLessons =
      certSectionIds.length > 0
        ? await db.select().from(lessons).where(inArray(lessons.sectionId, certSectionIds))
        : [];
    const allQuestions =
      certObjectiveIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.objectiveId, certObjectiveIds))
        : [];

    const lessonResults: ValidationResult[] = [];
    const questionResults: ValidationResult[] = [];

    // Validate lessons
    for (const lesson of allLessons) {
      const result = await this.validateLesson(lesson.id);
      lessonResults.push(result);
    }

    // Validate questions
    for (const question of allQuestions) {
      const result = await this.validateQuestion(question.id);
      questionResults.push(result);
    }

    const allResults = [...lessonResults, ...questionResults];
    const errorCount = allResults.filter((r) => !r.isValid).length;
    const warningCount = allResults.flatMap((r) => r.issues).filter((i) => i.severity === "warning").length;

    const [sourceCoverage, staleContent] = await Promise.all([
      this.validateSourceCoverage(certificationId),
      this.getStaleContentCounts(certificationId),
    ]);

    return {
      certificationId,
      totalContent: allResults.length,
      validContent: allResults.filter((r) => r.isValid).length,
      invalidContent: errorCount,
      warnings: warningCount + sourceCoverage.objectivesWithoutReference.length,
      results: allResults,
      sourceCoverage,
      staleContent,
    };
  }
}
