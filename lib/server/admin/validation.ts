import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessons, questions, questionOptions } from "@/lib/server/db/schema";

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
   * Validates all content for a certification
   */
  static async validateCertificationContent(certificationId: string) {
    const db = getDb();

    // Get all lessons for this certification (via sections → objectives → domains)
    const allLessons = await db.select().from(lessons);
    const allQuestions = await db.select().from(questions);

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

    return {
      certificationId,
      totalContent: allResults.length,
      validContent: allResults.filter((r) => r.isValid).length,
      invalidContent: errorCount,
      warnings: warningCount,
      results: allResults,
    };
  }
}
